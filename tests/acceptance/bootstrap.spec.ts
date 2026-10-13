import { test,expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
test('fresh owner changes initial password through the actual web form',async({page})=>{
  const initial=readFileSync(process.env.FOXCORE_INITIAL_PASSWORD_FILE!,'utf8');
  const next=readFileSync(process.env.TEST_OWNER_PASSWORD_FILE!,'utf8');
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await page.getByLabel('用户名',{exact:true}).fill('owner');await page.getByLabel('密码',{exact:true}).fill(initial);await page.getByRole('button',{name:'登录系统 →'}).click();
  await expect(page.getByRole('heading',{name:'设置个人密码'})).toBeVisible();
  await page.getByLabel('当前密码',{exact:true}).fill(initial);await page.getByLabel('新密码（至少 16 字符）').fill(next);
  const response=page.waitForResponse(r=>r.url().endsWith('/api/v1/auth/password')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'保存新密码'}).click();const changed=await response;
  expect(changed.status()).toBe(200);expect(changed.request().headers()['content-type']).toContain('application/json');
  await expect(page.getByRole('heading',{name:'登录工作台'})).toBeVisible();
  await page.getByLabel('用户名',{exact:true}).fill('owner');await page.getByLabel('密码',{exact:true}).fill(next);await page.getByRole('button',{name:'登录系统 →'}).click();
  await expect(page.getByRole('heading',{name:'运营工作台'})).toBeVisible();
  const old=await page.request.post('/api/v1/auth/login',{data:{username:'owner',password:initial}});expect(old.status()).toBe(401);
  expect(errors).toEqual([]);
});
