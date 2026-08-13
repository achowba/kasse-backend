import { NodeEnvEnum } from '@common/enums';
import { areDocsEnabled } from './index';

describe('areDocsEnabled', () => {
  it('withholds the documentation UI in production', () => {
    // The UI is a live client against the real API. It invites a reader to press
    // Execute, and on production that reader is authenticating and writing real
    // records against real money.
    expect(areDocsEnabled(NodeEnvEnum.PRODUCTION)).toBe(false);
  });

  it.each([NodeEnvEnum.DEVELOPMENT, NodeEnvEnum.TEST, NodeEnvEnum.STAGING])('serves it in %s', (nodeEnv) => {
    expect(areDocsEnabled(nodeEnv)).toBe(true);
  });

  it('serves it for an environment nobody has thought of yet', () => {
    // The rule is a single exclusion rather than an allowlist, so a new
    // environment name gets the docs by default. That is the safe direction:
    // the alternative fails closed on a name somebody forgot to add, and the
    // docs quietly vanish from staging with no error to explain it.
    expect(areDocsEnabled('preview' as NodeEnvEnum)).toBe(true);
  });
});
