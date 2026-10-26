import { request, confirm } from '../../lib/api';
import { clearSession, saveSession, session } from '../../lib/session';
import { errorText } from '../../lib/format';
import type { InputEvent, Session, User } from '../../lib/types';
Page({
  data: { username: '', password: '', currentPassword: '', newPassword: '', confirmPassword: '', busy: false, error: '', changing: false },
  async onLoad() {
    const s=session();this.setData({changing:!!s?.user.mustChangePassword});
    if(s&&!s.user.mustChangePassword){this.setData({busy:true});try{const value=await request<{user:User|null;csrf:string}>('/auth/me');if(value.user){saveSession({...s,user:value.user,csrf:value.csrf});if(value.user.mustChangePassword)this.setData({changing:true});else wx.switchTab({url:'/pages/home/index'});}else clearSession();}catch(error){this.setData({error:errorText(error)});}finally{this.setData({busy:false});}}
  },
  onUnload(){this.setData({password:'',currentPassword:'',newPassword:'',confirmPassword:''});},
  onPullDownRefresh() { wx.stopPullDownRefresh(); },
  input(e: InputEvent) { const field = String(e.currentTarget.dataset.field); if (['username','password','currentPassword','newPassword','confirmPassword'].includes(field)) this.setData({ [field]: e.detail.value }); },
  async submit() {
    if (this.data.busy) return;
    this.setData({ busy: true, error: '' });
    try {
      if (this.data.changing) {
        if (this.data.newPassword.length < 16) throw new Error('新密码至少 16 个字符');
        if (this.data.newPassword !== this.data.confirmPassword) throw new Error('两次新密码不一致');
        await request('/auth/password', 'POST', { currentPassword: this.data.currentPassword, newPassword: this.data.newPassword });
        clearSession(); this.setData({ changing: false, password: '', currentPassword: '', newPassword: '', confirmPassword: '' });
        wx.showToast({ title: '密码已修改，请重新登录', icon: 'none' });
      } else {
        if (!this.data.username.trim() || !this.data.password) throw new Error('请输入员工账号和密码');
        const auth = await request<Session>('/auth/mini/login', 'POST', { username: this.data.username.trim(), password: this.data.password });
        saveSession(auth);
        this.setData({ password: '', changing: auth.user.mustChangePassword });
        if (!auth.user.mustChangePassword) wx.switchTab({ url: '/pages/home/index' });
      }
    } catch (error) { this.setData({ error: errorText(error) }); }
    finally { this.setData({ busy: false }); }
  },
  async exit() {
    if (this.data.busy || !await confirm('退出当前账号', '确认退出并使用其他员工账号登录？')) return;
    this.setData({ busy: true, error: '' });
    try { await request('/auth/logout', 'POST', {}); clearSession(); this.setData({ changing: false, currentPassword: '', newPassword: '', confirmPassword: '' }); }
    catch (error) { this.setData({ error: errorText(error) }); }
    finally { this.setData({ busy: false }); }
  }
});
