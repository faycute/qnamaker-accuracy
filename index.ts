import * as msRest from '@azure/ms-rest-js';
import * as qnamaker from '@azure/cognitiveservices-qnamaker';
import * as qnamakerRuntime from "@azure/cognitiveservices-qnamaker-runtime";
import * as csvParser from 'csv-parser';
import * as fs from 'fs';
import {
    AUTHORING_KEY,
    COGNITIVE_SERVICES_NAME,
    QNAMAKER_APP_NAME,
    DATA_CSV_FILE_NAME,
    TESTER_USER_CSV_FILE_NAME,
    _TEST_QUERY_COUNT,
    _KB_DELETION,
    _USE_TESTER_DATA,
    _USE_TESTER_USER,
    _TOP_COUNT,
    _SCORE_THRESHOLD
} from './env-vars';

// data.csvのType
type DataRecord = {
    id: string,
    questions: string,
    answer: string,
};

// tester.data.csv, tester.user.csvのType
type TesterRecord = {
    expectedId: string,
    testQuery: string
};

const DATA_CSV_FILE_PATH = `${__dirname}/../input/${DATA_CSV_FILE_NAME}`;
const TESTER_DATA_CSV_FILE_PATH = `${__dirname}/../input/tester.${DATA_CSV_FILE_NAME}`;
const TESTER_USER_CSV_FILE_PATH = `${__dirname}/../input/${TESTER_USER_CSV_FILE_NAME}`;

const main = async () => {
    const authoringURL = `https://${COGNITIVE_SERVICES_NAME}.cognitiveservices.azure.com`;
    const queryingURL = `https://${QNAMAKER_APP_NAME}.azurewebsites.net`;

    const apiCreds = new msRest.ApiKeyCredentials({ inHeader: { 'Ocp-Apim-Subscription-Key': AUTHORING_KEY } });
    const qnaClient = new qnamaker.QnAMakerClient(apiCreds, authoringURL);
    const kbClient = new qnamaker.Knowledgebase(qnaClient);

    // 1. data.csvからKBを作成し、同時にtester.data.csvを作成
    const kbId = await createKBAndTesterData(qnaClient, kbClient);
    if (kbId && await publishKB(kbClient, kbId)) { // 2. KBの公開
        const primaryEndpointKey = await getEndpointKey(qnaClient);
        const qnaRuntimeClient = new qnamakerRuntime.QnAMakerRuntimeClient(apiCreds, queryingURL);

        // 3. 精度検証
        if (_USE_TESTER_DATA) await verifyAccuracy(qnaRuntimeClient, primaryEndpointKey, kbId, TESTER_DATA_CSV_FILE_PATH);
        if (_USE_TESTER_USER) await verifyAccuracy(qnaRuntimeClient, primaryEndpointKey, kbId, TESTER_USER_CSV_FILE_PATH);

        // 4. KBの削除
        if (_KB_DELETION) await deleteKnowledgeBase(kbClient, kbId);
    }
};

const createKBAndTesterData = async (qnaClient: qnamaker.QnAMakerClient, kbclient: qnamaker.Knowledgebase): Promise<string> => {
    const rs = fs.createReadStream(DATA_CSV_FILE_PATH);
    const ws = fs.createWriteStream(TESTER_DATA_CSV_FILE_PATH);
    ws.write('expectedId,testQuery\n');
    const qnaList: qnamaker.QnAMakerModels.QnADTO[] = [];

    // 1-1. data.csvからKB作成用のオブジェクトを作成し、同時にtester.data.csvを作成
    for await (const line of rs.pipe(csvParser())) {
        const record = line as DataRecord;

        // stringで取得されるので、型を変換
        const id = Number(record.id);
        const questions = record.questions.split(',');
        const answer = record.answer;

        // data.csvのバリデーション
        if (!answer) console.error(`Answer is empty. ID: ${id}`);
        if (questions.includes('')) console.error(`Questions have empty. ID: ${id}`);

        if (questions.length > _TEST_QUERY_COUNT) {
            // テストデータ用に使用する数よりも登録questions数が多い場合のみ、
            // 指定数分ランダムでquestionを抜き出してtester.data.csvに書き込んでいく
            for (let i = 0; i < _TEST_QUERY_COUNT; i++) {
                const [ testQuery ] = questions.splice(Math.floor(Math.random() * questions.length), 1);
                ws.write(`${id},${testQuery}\n`);
            }
        }
        // KB作成用のオブジェクトを作成
        qnaList.push({ id, questions, answer });
    }

    // 1-2. KBの作成をリクエスト
    const results = await kbclient.create({
        name: 'tmp-kb',
        qnaList,
        language: 'Japanese'
    });

    if (!results._response.status.toString().includes('2')) {
        // KBの作成リクエストに失敗した場合の処理
        console.log(`Create request failed - HTTP status ${results._response.status}`);
        return;
    }

    // 1-3. KBの作成が完了するまで待機
    const operationResult = await waitForOperation(qnaClient, results.operationId);
    if (!operationResult || !operationResult.operationState || !(operationResult.operationState === 'Succeeded') || !operationResult.resourceLocation) {
        // KBの作成に失敗した場合の処理
        console.log(`Create operation state failed - HTTP status ${operationResult._response.status}`);
        return;
    }

    // 1-4. KB IDを取得して返す
    const kbId = operationResult.resourceLocation.replace('/knowledgebases/', '');
    console.log(`kbId: ${kbId}`);
    return kbId;

};

const waitForOperation = async (qnaClient: qnamaker.QnAMakerClient, operationId: string): Promise<qnamaker.QnAMakerModels.OperationsGetDetailsResponse> => {
    let state: qnamaker.QnAMakerModels.OperationStateType = 'NotStarted';
    let operationResult: qnamaker.QnAMakerModels.OperationsGetDetailsResponse;

    while (state === 'Running' || state === 'NotStarted') {
        operationResult = await qnaClient.operations.getDetails(operationId);
        state = operationResult.operationState;
        console.log(`Operation state - ${state}`);
        await delayTimer(1000);
    }
    return operationResult;
};

const delayTimer = async (timeInMs: number) => {
    return await new Promise((resolve) => {
        setTimeout(resolve, timeInMs);
    });
};

const publishKB = async (kbclient: qnamaker.Knowledgebase, kbId: string): Promise<boolean> => {
    // 2-1. KBの公開をリクエスト
    const results = await kbclient.publish(kbId);
    if (!results._response.status.toString().includes('2')) {
        // KBの公開リクエストの失敗した場合の処理
        console.log(`Publish request failed - HTTP status ${results._response.status}`);
        return false;
    }
    // KBの公開リクエストの成功した場合の処理
    console.log(`Publish request succeeded - HTTP status ${results._response.status}`);
    return true;
};

const getEndpointKey = async (qnaClient: qnamaker.QnAMakerClient): Promise<string> => {
    const runtimeKeysClient = qnaClient.endpointKeys;
    const results = await runtimeKeysClient.getKeys();
    if (!results._response.status.toString().includes('2')) {
        console.log(`GetEndpointKeys request failed - HTTP status ${results._response.status}`);
        return '';
    }
    console.log(`GetEndpointKeys request succeeded - HTTP status ${results._response.status} - primary key ${results.primaryEndpointKey}`)
    return results.primaryEndpointKey;
};

const verifyAccuracy = async (
    qnaRuntimeClient: qnamakerRuntime.QnAMakerRuntimeClient,
    primaryEndpointKey: string,
    kbId: string,
    testerFilePath: string): Promise<void> => {

    let successCount = 0;
    let caseCount = 0;

    const now = new Date().toISOString();
    // inputファイル名からoutputファイル名を日時付きで命名
    const responseFilePath = testerFilePath.replace('input', 'output').replace('tester', 'response').replace('.csv', `.${now}.csv`);
    const resultFilePath = testerFilePath.replace('input', 'output').replace('tester', 'result').replace('.csv', `.${now}.txt`);

    const rs = fs.createReadStream(testerFilePath);
    const responseWS = fs.createWriteStream(responseFilePath);
    responseWS.write('caseCount,testQuery,expectedId,result,responseId,score,responseQ,responseA\n');

    // 3-1. テストケースの数だけ、QnA Makerにクエリして回答を取得し、その結果をresponse.data.csv / response.user.csvへ出力
    for await (const line of rs.pipe(csvParser())) {
        const { expectedId, testQuery } = line as TesterRecord;
        
        // QnA Makerにクエリして回答を取得
        const response = await generateAnswer(testQuery, qnaRuntimeClient, primaryEndpointKey, kbId);

        // response.data.csv / response.user.csvへの書き込み
        for (const [index, { id, score, questions, answer }] of response.answers.entries()) {
            // questionは数が多くなるので0番目の代表質問のみをレコードに記載
            let record = `${id},${score},${questions[0]},${answer}`;

            if (Number(expectedId) === id) {
                // 実際に取得したidと予想idが一致したら、
                // そのレコードのresultカラムの値を*にし、
                // 集計用にsuccessCountを+1する
                record = `*,${record}`;
                successCount++;
            } else {
                record = `,${record}`;
            }

            if (index === 0) {
                // caseCountやtestQueryはoutputファイル上では全レコードに必要ないため、0番目のときだけ書き込む
                record = `${++caseCount},${testQuery},${expectedId},${record}`;
            } else {
                record = `,,,${record}`;
            }
            responseWS.write(`${record}\n`);
        }
    }

    // 3-2. 精度を計算し、result.data.txt / result.user.txtへ出力
    const resultWS = fs.createWriteStream(resultFilePath);
    const accuracy = successCount / caseCount;
    console.log(`Accuracy: ${successCount} / ${caseCount} = ${accuracy}`);
    resultWS.write(`Accuracy: ${successCount} / ${caseCount} = ${accuracy}\n`);
};


const generateAnswer = (
    question: string,
    qnaRuntimeClient: qnamakerRuntime.QnAMakerRuntimeClient,
    primaryEndpointKey: string,
    kbId: string
): Promise<qnamakerRuntime.QnAMakerRuntimeModels.RuntimeGenerateAnswerResponse> => {

    return qnaRuntimeClient.runtime.generateAnswer(
        kbId,
        // 別のKBの情報が混ざってしまうため、isTestはtrue
        // Answerの文言を考慮に入れて欲しくないため、rankerTypeはQuestionOnly
        { question, top: _TOP_COUNT, scoreThreshold: _SCORE_THRESHOLD, context: {}, isTest: true, rankerType: 'QuestionOnly' },
        { customHeaders: { Authorization: `EndpointKey ${primaryEndpointKey}` } }
    );
}

const deleteKnowledgeBase = async (kBclient: qnamaker.Knowledgebase, kbId: string): Promise<void> => {
    // 4-1. KBの削除をリクエスト
    const results = await kBclient.deleteMethod(kbId);
    if (!results._response.status.toString().includes('2')) {
        // KBの削除リクエストの失敗した場合の処理
        console.log(`KB Delete operation state failed - HTTP status ${results._response.status}`)
    }
    // KBの削除リクエストの成功した場合の処理
    console.log(`KB Delete operation state succeeded - HTTP status ${results._response.status}`)
}

main();