import { Criticality } from '../src/Criticality';
import { AppDomainUtil } from '../src/Util';

test('get domain names', () => {
  const domainNames = AppDomainUtil.getDomainNames({
    branchName: 'test',
    pipelineStackName: 'unit-test-pipeline-stack',
    codeStarConnectionArn: '',
    deployFromEnvironment: { region: '', account: '' },
    deployToEnvironment: { region: '', account: '' },
    includePipelineValidationChecks: false,
    setWafRatelimit: false,
    useDemoScheme: true,
    nijmegenSubdomain: 'test',
    useLambdaRoleForYiviServer: true,
    criticality: new Criticality('low'),
    useHaalCentraalBrp: false,
  }, 'test.csp-nijmegen.nl');
  expect(domainNames).toContain('test.nijmegen.nl');
  expect(domainNames).toContain('test.csp-nijmegen.nl');
});


test('baseurl', () => {
  const baseurl = AppDomainUtil.getBaseUrl({
    branchName: 'test',
    pipelineStackName: 'unit-test-pipeline-stack',
    codeStarConnectionArn: '',
    deployFromEnvironment: { region: '', account: '' },
    deployToEnvironment: { region: '', account: '' },
    includePipelineValidationChecks: false,
    setWafRatelimit: false,
    useDemoScheme: true,
    nijmegenSubdomain: 'test',
    useLambdaRoleForYiviServer: true,
    criticality: new Criticality('low'),
    useHaalCentraalBrp: false,
  }, 'test.csp-nijmegen.nl');
  expect(baseurl).toContain('https://test.nijmegen.nl/');
});