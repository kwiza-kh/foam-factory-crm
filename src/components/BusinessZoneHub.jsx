import {
  ArrowRight,
  Building2,
  Factory,
  LogOut,
  UserRound,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { desktopRoleLabel } from "@/lib/auth";

export default function BusinessZoneHub({ currentUser, onLogout, onSelectZone }) {
  const zones = [
    {
      key: "customers",
      title: "客户专区",
      text: "客户档案、订单、送货、对账",
      icon: Building2,
    },
    {
      key: "employees",
      title: "员工专区",
      text: "人员工作台",
      icon: Users,
    },
  ];

  return (
    <main className="zone-shell">
      {/* Top Bar */}
      <header className="zone-topbar">
        <div className="auth-logo-row compact">
          <div className="auth-logo">
            <Factory size={22} />
          </div>
          <div>
            <p>FOAM OPS</p>
            <strong>业务专区</strong>
          </div>
        </div>

        <div className="zone-user-actions">
          <span className="session-chip">
            <UserRound size={15} />
            {currentUser.name || currentUser.phone} · {desktopRoleLabel(currentUser.role)}
          </span>
          <Button variant="ghost" size="sm" onClick={onLogout} className="ghost-button compact">
            <LogOut size={15} />
            退出
          </Button>
        </div>
      </header>

      {/* Hero / Zone Grid */}
      <section className="zone-hero">
        <div>
          <p className="eyebrow">WORKSPACES</p>
          <h1>选择业务专区</h1>
        </div>

        <div className="zone-grid">
          {zones.map((zone) => {
            const Icon = zone.icon;
            return (
              <button
                className="zone-card"
                key={zone.key}
                type="button"
                onClick={() => onSelectZone(zone.key)}
              >
                <span className="zone-card-icon">
                  <Icon size={24} />
                </span>
                <strong>{zone.title}</strong>
                <small>{zone.text}</small>
                <ArrowRight size={18} />
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}
