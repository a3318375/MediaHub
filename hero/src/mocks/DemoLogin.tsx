import {
useEffect,
useRef,
useState,
type FormEvent
} from "react";

import {
Button,
Checkbox,
Input
} from "@heroui/react";

import {
ArrowRight,
Eye,
EyeOff
} from "lucide-react";

import {
DEMO_EMAIL,
DEMO_PASSWORD
} from "./data";

import { SalesChart } from "./charts";
import { Avatar,Growth } from './dashboard-template';


export function Login({
  onLogin,
  onForgot,
}: {
  onLogin: (remember: boolean) => void;
  onForgot: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (
      email.trim().toLowerCase() !== DEMO_EMAIL ||
      password !== DEMO_PASSWORD
    ) {
      setError(
        "The email or password is incorrect. Use the demo account below.",
      );
      return;
    }
    setPending(true);
    timer.current = setTimeout(() => onLogin(remember), 350);
  }
  return (
    <div className="login-layout">
      <section className="login-main">
        <a className="login-brand" href="#/login">
          <img src="/favicon.svg" alt="" />
          <span>
            hero<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="login-form-wrap">
          <div className="login-heading">
            <h1>Welcome back</h1>
            <p>Sign in to your workspace to continue.</p>
          </div>
          <form className="login-form" onSubmit={submit}>
            <label className="form-label">
              Email
              <Input
                type="email"
                name="email"
                autoComplete="username"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                fullWidth
              />
            </label>
            <label className="form-label">
              Password
              <div className="password-field">
                <Input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  fullWidth
                />
                <Button
                  type="button"
                  variant="ghost"
                  isIconOnly
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </Button>
              </div>
            </label>
            <div className="login-options">
              <Checkbox isSelected={remember} onChange={setRemember}>
                <Checkbox.Content>
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  Remember me
                </Checkbox.Content>
              </Checkbox>
              <button className="text-link" type="button" onClick={onForgot}>
                Forgot password?
              </button>
            </div>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <Button
              className="sign-in-button"
              type="submit"
              fullWidth
              isPending={pending}
            >
              {pending ? "Signing in…" : "Sign in"}
              <ArrowRight size={16} />
            </Button>
          </form>
          <div className="login-divider">
            <span>Explore the demo</span>
          </div>
          <Button
            variant="secondary"
            fullWidth
            className="demo-button"
            onPress={() => {
              setEmail(DEMO_EMAIL);
              setPassword(DEMO_PASSWORD);
              setError("");
            }}
          >
            Use demo account
          </Button>
          <p className="demo-credentials">
            <span>{DEMO_EMAIL}</span>
            <span>Password: {DEMO_PASSWORD}</span>
          </p>
        </div>
        <footer className="login-footer">
          <span>© 2026 Hero workspace</span>
          <span>Independent local demo</span>
        </footer>
      </section>
      <section className="login-showcase">
        <div className="showcase-orb" />
        <div className="showcase-copy">
          <span className="eyebrow">YOUR WORKSPACE, SIMPLIFIED</span>
          <h2>
            A clearer view.
            <br />A better workday.
          </h2>
          <p>
            Your team, your numbers, your next big idea.
            <br />
            Bring it all together in one beautiful workspace.
          </p>
        </div>
        <div className="showcase-dashboard">
          <div className="showcase-header">
            <span className="mini-orb" />
            Good morning, Kate{" "}
            <span className="showcase-live">
              <span />
              All systems operational
            </span>
          </div>
          <div className="showcase-stats">
            <div>
              <span>Revenue</span>
              <strong>US$228,441</strong>
              <Growth soft />
            </div>
            <div>
              <span>Total sales</span>
              <strong>458</strong>
              <Growth soft />
            </div>
          </div>
          <div className="showcase-chart">
            <span>Sales Performance</span>
            <SalesChart />
          </div>
        </div>
        <div className="showcase-bottom">
          <span className="avatars-stack">
            {["indigo", "rose", "sky", "emerald"].map((avatar) => (
              <Avatar key={avatar} avatar={avatar} name="Team member" />
            ))}
          </span>
          <span>Great work starts with a great team.</span>
        </div>
      </section>
    </div>
  );
}
