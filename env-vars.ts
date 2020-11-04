const {
    AUTHORING_KEY,
    COGNITIVE_SERVICES_NAME,
    QNAMAKER_APP_NAME,
    DATA_CSV_FILE_NAME,
    TESTER_USER_CSV_FILE_NAME,
    TEST_QUERY_COUNT,
    KB_DELETION,
    USE_TESTER_DATA,
    USE_TESTER_USER,
    TOP_COUNT,
    SCORE_THRESHOLD
} = process.env;

if (!AUTHORING_KEY) throw new Error('AUTHORING_KEY is not set in .env.');
if (!COGNITIVE_SERVICES_NAME) throw new Error('COGNITIVE_SERVICES_NAME is not set in .env.');
if (!QNAMAKER_APP_NAME) throw new Error('QNAMAKER_APP_NAME is not set in .env.');
if (!DATA_CSV_FILE_NAME) throw new Error('DATA_CSV_FILE_NAME is not set in .env.');
if (!TESTER_USER_CSV_FILE_NAME) throw new Error('TESTER_USER_CSV_FILE_NAME is not set in .env.');
if (!TEST_QUERY_COUNT) throw new Error('TEST_QUERY_COUNT is not set in .env.');
if (!KB_DELETION) throw new Error('KB_DELETION is not set in .env.');
if (!USE_TESTER_DATA) throw new Error('USE_TESTER_DATA is not set in .env.');
if (!USE_TESTER_USER) throw new Error('USE_TESTER_USER is not set in .env.');
if (!TOP_COUNT) throw new Error('TOP_COUNT is not set in .env.');
if (!SCORE_THRESHOLD) throw new Error('SCORE_THRESHOLD is not set in .env.');

const _TEST_QUERY_COUNT = Number(TEST_QUERY_COUNT);
const _KB_DELETION = KB_DELETION === 'true' ? true : false;
const _USE_TESTER_DATA = USE_TESTER_DATA === 'true' ? true : false;
const _USE_TESTER_USER = USE_TESTER_USER === 'true' ? true : false;
const _TOP_COUNT = Number(TOP_COUNT);
const _SCORE_THRESHOLD = Number(SCORE_THRESHOLD);

export {
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
};