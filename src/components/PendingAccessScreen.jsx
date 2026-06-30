import { LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PendingAccessScreen({ currentUser, onLogout }) {
  return (
    <main className="zone-shell">
      <section className="pending-panel">
        <div className="auth-logo">
          <ShieldCheck size={28} />
        </div>
        <p className="eyebrow">ACCESS PENDING</p>
        <h1>账号待授权</h1>
        <p>{currentUser.name || currentUser.phone} 当前还没有员工或管理员权限。</p>
        <Button variant="ghost" size="sm" onClick={onLogout} className="ghost-button compact">
          <LogOut size={15} />
          退出登录
        </Button>
      </section>
    </main>
  );
}
