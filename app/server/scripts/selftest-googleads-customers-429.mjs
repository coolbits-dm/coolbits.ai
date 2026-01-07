import dotenv from 'dotenv';

dotenv.config({ path: new URL('../../../.env', import.meta.url) });

const { mapGoogleAdsCustomersError } = await import('../router/googleads-router.js');

const err = new Error('listAccessibleCustomers failed: 429');
err.status = 429;

const result = mapGoogleAdsCustomersError(err);
const expected = {
  httpStatus: 429,
  body: { error: 'googleads_rate_limited', action: 'retry_later', status: 429 },
};

const pass =
  result?.httpStatus === expected.httpStatus &&
  JSON.stringify(result.body) === JSON.stringify(expected.body);

if (pass) {
  console.log('PASS googleads 429 mapping');
  process.exit(0);
}

console.log('FAIL googleads 429 mapping');
console.log('expected=' + JSON.stringify(expected));
console.log('actual=' + JSON.stringify(result));
process.exit(1);
