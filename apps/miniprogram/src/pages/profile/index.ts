import { request, confirm, pendingCommands, retryPending, type PendingSummary } from '../../lib/api';
import { requireSession, clearSession, session, saveSession } from '../../lib/session';
import { errorText } from '../../lib/format';
import type { User, InputEvent, TapEvent, IdResult } from '../../lib/types';
Page({
  data: { username: '', role: '', busy: false, error: '', currentPassword: '', newPassword: '', confirmPassword: '', pending: [] as PendingSummary[] },
  onShow() { const s = requireSession(); if (s) this.setData({ username: s.user.username, role: s.user.role === 'OWNER' ? '管理员' : '销售顾问',pending:pendingCommands() }); },
  onPullDownRefresh() { void this.refresh(); },
  async refresh() { try { const value = await request<{ user: User | null; csrf: string }>('/auth/me'); const s = session(); if (!value.user) { clearSession(); wx.reLaunch({ url: '/pages/login/index' }); } else if (s) saveSession({ ...s, user: value.user, csrf: value.csrf }); } catch (error) { this.setData({ error: errorText(error) }); } finally { wx.stopPullDownRefresh(); } },
  input(e: InputEvent) { const field = String(e.currentTarget.dataset.field); if (['currentPassword','newPassword','confirmPassword'].includes(field)) this.setData({ [field]: e.detail.value }); },
  async password() {
    if (this.data.busy) return; this.setData({ busy: true, error: '' });
    try {
      if (this.data.newPassword !== this.data.confirmPassword) throw new Error('两次新密码不一致');
      if (this.data.newPassword.length < 16) throw new Error('新密码至少 16 个字符');
      await request('/auth/password','POST',{ currentPassword:this.data.currentPassword,newPassword:this.data.newPassword });
      clearSession(); this.setData({ currentPassword:'',newPassword:'',confirmPassword:'' }); wx.reLaunch({ url:'/pages/login/index' });
    } catch(error) { this.setData({ error:errorText(error) }); } finally { this.setData({ busy:false }); }
  },
  async logout() {
    if (this.data.busy || !await confirm('退出登录','退出后需要重新输入员工账号。确认退出？')) return;
    this.setData({ busy:true,error:'' });
    try { await request('/auth/logout','POST',{}); clearSession(); wx.reLaunch({ url:'/pages/login/index' }); }
    catch(error) { this.setData({ error:errorText(error) }); } finally { this.setData({ busy:false }); }
  },
  async retry(e:TapEvent) {
    if(this.data.busy)return; const p=this.data.pending[Number(e.currentTarget.dataset.index)];if(!p)return;
    if(!await confirm('核对上次操作','将使用上次完全相同的内容与操作编号查询或重试，不会另建同一笔业务。请勿重复进行线下收付款。'))return;
    this.setData({busy:true,error:''});
    try {
      const r=await retryPending<IdResult>(p.storageKey);this.setData({pending:pendingCommands()});
      wx.showToast({title:'上次操作已核对',icon:'success'});
      if(r.id && p.path.startsWith('/sales'))wx.navigateTo({url:'/pages/sale-detail/index?id='+r.id});
      else if(r.id && p.path.startsWith('/returns'))wx.navigateTo({url:'/pages/return-detail/index?id='+r.id});
      else if(r.id && p.path.startsWith('/commissions'))wx.navigateTo({url:'/pages/settlement-detail/index?id='+r.id});
      else if(p.path.startsWith('/stock/'))wx.switchTab({url:'/pages/inventory/index'});
    }catch(error){this.setData({error:errorText(error)});}finally{this.setData({busy:false});}
  }
});
