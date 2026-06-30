import { useState } from "react";
import {
  Factory,
  KeyRound,
  UserRoundPlus,
  UserRound,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export default function LoginScreen({ loading, onLogin, onRegister }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isRegister = mode === "register";

  const switchMode = (nextMode) => {
    if (loading || submitting || nextMode === mode) return;
    setMode(nextMode);
    setError("");
    setPassword("");
    setConfirmPassword("");
  };

  const submit = async (event) => {
    event.preventDefault();
    if (loading || submitting) return;
    setError("");

    const normalizedPhone = phone.trim();
    const normalizedName = name.trim();
    if (!normalizedPhone) {
      setError("请输入手机号");
      return;
    }
    if (!password) {
      setError("请输入密码");
      return;
    }
    if (isRegister) {
      if (!normalizedName) {
        setError("请输入姓名");
        return;
      }
      if (password.length < 6) {
        setError("密码至少需要 6 位");
        return;
      }
      if (password !== confirmPassword) {
        setError("两次输入的密码不一致");
        return;
      }
    }

    setSubmitting(true);
    try {
      if (isRegister) {
        await onRegister({ name: normalizedName, phone: normalizedPhone, password });
      } else {
        await onLogin({ phone: normalizedPhone, password });
      }
    } catch (err) {
      setError(err.message || (isRegister ? "注册失败" : "登录失败"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-screen">
      {/* ── Visual / Brand Side ── */}
      <section className="auth-visual" aria-label="FOAM OPS">
        <div className="auth-logo-row">
          <div className="auth-logo">
            <Factory size={26} />
          </div>
          <div>
            <p>FOAM OPS</p>
            <strong>泡沫厂业务系统</strong>
          </div>
        </div>

        <div className="auth-dashboard-preview">
          <div className="auth-preview-head">
            <span />
            <span />
            <span />
          </div>
          <div className="auth-preview-grid">
            <div />
            <div />
            <div />
          </div>
          <div className="auth-preview-table">
            {["订单排产", "送货签收", "客户对账", "成本审批"].map((label, index) => (
              <span key={label} style={{ "--bar": `${74 - index * 11}%` }}>
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="auth-visual-footer">
          <ShieldCheck size={18} />
          <span>账号验证 · 会话保持 · 专区分流</span>
        </div>
      </section>

      {/* ── Auth Panel ── */}
      <Card
        className={cn(
          "auth-panel",
          isRegister && "auth-panel-register"
        )}
        aria-label={isRegister ? "注册账号" : "登录"}
      >
        <CardHeader className="auth-panel-head !pb-3">
          <p className="text-[11px] font-extrabold tracking-[0.08em] text-primary uppercase">
            {isRegister ? "CREATE ACCOUNT" : "WELCOME BACK"}
          </p>
          <CardTitle className="!text-[clamp(30px,4vw,48px)] !leading-tight !m-0">
            {isRegister ? "注册业务账号" : "登录业务专区"}
          </CardTitle>
        </CardHeader>

        <CardContent className="!pt-0">
          {/* Mode Switch Tabs */}
          <Tabs
            value={mode}
            onValueChange={switchMode}
            className="mb-5"
          >
            <TabsList className="auth-mode-switch w-full grid grid-cols-2">
              <TabsTrigger
                value="login"
                disabled={loading || submitting}
                className="auth-mode-button data-[selected]:auth-mode-button-active"
              >
                <KeyRound size={16} />
                登录
              </TabsTrigger>
              <TabsTrigger
                value="register"
                disabled={loading || submitting}
                className="auth-mode-button data-[selected]:auth-mode-button-active"
              >
                <UserRoundPlus size={16} />
                注册账号
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <form className="auth-form" onSubmit={submit}>
            {isRegister && (
              <div className="auth-field">
                <Label>姓名</Label>
                <div>
                  <UserRoundPlus size={17} />
                  <Input
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="请输入真实姓名"
                    className="!border-0 !bg-transparent !h-auto !p-0 !text-base"
                  />
                </div>
              </div>
            )}

            <div className="auth-field">
              <Label>手机号</Label>
              <div>
                <UserRound size={17} />
                <Input
                  autoComplete="username"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="请输入手机号"
                  className="!border-0 !bg-transparent !h-auto !p-0 !text-base"
                />
              </div>
            </div>

            <div className="auth-field">
              <Label>密码</Label>
              <div>
                <KeyRound size={17} />
                <Input
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isRegister ? "请设置至少 6 位密码" : "请输入密码"}
                  className="!border-0 !bg-transparent !h-auto !p-0 !text-base"
                />
              </div>
            </div>

            {isRegister && (
              <div className="auth-field">
                <Label>确认密码</Label>
                <div>
                  <KeyRound size={17} />
                  <Input
                    autoComplete="new-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="请再次输入密码"
                    className="!border-0 !bg-transparent !h-auto !p-0 !text-base"
                  />
                </div>
              </div>
            )}

            {isRegister && (
              <p className="auth-hint">
                注册后需要管理员授权为员工或管理员，才能进入业务专区。
              </p>
            )}

            {error && <p className="auth-error">{error}</p>}

            <Button
              type="submit"
              disabled={loading || submitting}
              className="auth-submit w-full"
              size="lg"
            >
              {isRegister ? <UserRoundPlus size={18} /> : <KeyRound size={18} />}
              {loading
                ? "正在恢复会话"
                : submitting
                  ? isRegister ? "注册中" : "登录中"
                  : isRegister ? "注册账号" : "登录"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
