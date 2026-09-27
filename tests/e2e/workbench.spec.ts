import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const file=process.env.TEST_OWNER_PASSWORD_FILE;
if(!file) throw new Error('TEST_OWNER_PASSWORD_FILE must point to the private owner password file');
const password=readFileSync(file,'utf8');
test('owner can navigate the real business UI without browser errors',async({page},testInfo)=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await page.getByRole('textbox',{name:'用户名'}).fill('owner');
  await page.getByRole('textbox',{name:'密码'}).fill(password);
  await page.getByRole('button',{name:'登录系统 →'}).click();
  await expect(page.getByRole('heading',{name:'运营工作台'})).toBeVisible();
  await page.getByRole('link',{name:'进入销售工作台 →',exact:true}).click();
  await expect(page.getByRole('heading',{name:'销售工作台'})).toBeVisible();
  await expect(page.getByText('新建销售草稿')).toBeVisible();
  await page.screenshot({path:`docs/evidence/${testInfo.project.name}-sales.png`,fullPage:true});
  await page.reload();
  await expect(page.getByRole('heading',{name:'销售工作台'})).toBeVisible();
  await page.locator('nav a[href="/reports"]').click();
  await expect(page.getByRole('heading',{name:'经营报表'})).toBeVisible();
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('link',{name:'导出 CSV'}).click();
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toBe('foxcore-report.csv');
  expect(errors).toEqual([]);
});
