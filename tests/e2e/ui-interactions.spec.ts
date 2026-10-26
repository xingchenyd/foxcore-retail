import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('loaded-record search, exact sales preview and account exit work on desktop and mobile', async ({ page }) => {
  const passwordFile=process.env.TEST_OWNER_PASSWORD_FILE;
  if(!passwordFile) throw new Error('TEST_OWNER_PASSWORD_FILE must point to the private owner password file');
  await page.goto('/');
  await page.getByLabel('用户名',{exact:true}).fill('owner');
  await page.getByLabel('密码',{exact:true}).fill(readFileSync(passwordFile,'utf8'));
  await page.getByRole('button',{name:'登录系统 →'}).click();
  await expect(page.getByRole('heading',{name:'运营工作台'})).toBeVisible();

  await page.locator('nav a[href="/products"]').click();
  const search=page.getByRole('searchbox',{name:'搜索本页已加载记录'});
  await search.fill('no-such-record-foxcore-ui-test');
  await expect(page.getByText('未加载的其他分页不包含在搜索内。')).toBeVisible();
  await expect(page.getByText('没有匹配的记录',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'清除搜索',exact:true}).click();
  await expect(search).toHaveValue('');

  await page.locator('nav a[href="/sales"]').click();
  const draft=page.locator('section.box').filter({has:page.getByRole('heading',{name:'新建销售草稿',exact:true})});
  await draft.getByLabel('数量',{exact:true}).fill('3');
  await draft.getByLabel('协商单价 CAD').fill('0.10');
  await expect(draft.locator('.draft-total strong')).toHaveText('$0.30');
  await draft.getByLabel('协商单价 CAD').fill('0.001');
  await expect(draft.locator('.draft-total strong')).toHaveText('—');
  await expect(page.locator('.sale-steps [aria-current="step"]')).toContainText('选择班次与商品');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);

  // The mobile layout previously hid the entire profile and logout control.
  const logout=page.getByRole('button',{name:'退出登录',exact:true});
  await expect(logout).toBeVisible();
  await logout.click();
  await expect(page.getByRole('heading',{name:'登录工作台'})).toBeVisible();
});
