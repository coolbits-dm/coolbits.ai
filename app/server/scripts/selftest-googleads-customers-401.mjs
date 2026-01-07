import dotenv from 'dotenv';

dotenv.config({ path: new URL('../../../.env', import.meta.url) });

const { mapGoogleAdsCustomersError } = await import('../router/googleads-router.js');

const err = new Error('listAccessibleCustomers failed: 401');
err.status = 401;

const result = mapGoogleAdsCustomersError(err);
const expected = {
  httpStatus: 401,
  body: { error: 'googleads_auth_failed', action: 'reconnect', status: 401 },
};

const pass =
  result?.httpStatus === expected.httpStatus &&
  JSON.stringify(result.body) === JSON.stringify(expected.body);

if (pass) {
  console.log('PASS googleads 401 mapping');
  process.exit(0);
}

console.log('FAIL googleads 401 mapping');
console.log('expected=' + JSON.stringify(expected));
console.log('actual=' + JSON.stringify(result));
process.exit(1);
