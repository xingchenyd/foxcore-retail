import { defineConfig, devices } from '@playwright/test';
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.TEST_BASE_URL??'')||!/^foxverify_[a-f0-9]{12}$/.test(process.env.FOXCORE_VERIFY_PROJECT??''))throw new Error('Use npm run verify:full with its owned isolated stack');
export default defineConfig({
  testDir:'tests/acceptance',testMatch:process.env.FOXCORE_BOOTSTRAP==='yes'?'bootstrap.spec.ts':'business.spec.ts',
  timeout:240_000,fullyParallel:false,workers:1,retries:0,
  outputDir:process.env.FOXCORE_PRIVATE_RESULTS??'test-results',
  use:{baseURL:process.env.TEST_BASE_URL,trace:'off',screenshot:'off',video:'off'},
  projects:process.env.FOXCORE_BOOTSTRAP==='yes'?[{name:'bootstrap',use:{...devices['Desktop Chrome']}}]:[
    {name:'desktop-business',use:{...devices['Desktop Chrome']}},
    {name:'mobile-business',use:{...devices['iPhone 13'],browserName:'chromium'}}
  ],reporter:'list'
});
