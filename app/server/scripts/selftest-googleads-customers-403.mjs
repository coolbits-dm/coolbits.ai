import dotenv from 'dotenv';

dotenv.config({ path: new URL('../../../.env', import.meta.url) });

const { mapGoogleAdsCustomersError } = await import('../router/googleads-router.js');

const err = new Error('listAccessibleCustomers failed: 403');
err.status = 403;
err.details = 'developer token not approved';

const result = mapGoogleAdsCustomersError(err);
const expected = {
  httpStatus: 403,
  body: { error: 'googleads_developer_token_not_approved', action: 'contact_support', status: 403 },
};

const pass =
  result?.httpStatus === expected.httpStatus &&
  JSON.stringify(result.body) === JSON.stringify(expected.body);

if (pass) {
  console.log('PASS googleads 403 mapping');
  process.exit(0);
}

console.log('FAIL googleads 403 mapping');
console.log('expected=' + JSON.stringify(expected));
console.log('actual=' + JSON.stringify(result));
process.exit(1);
