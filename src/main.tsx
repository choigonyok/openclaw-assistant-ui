import React, { FormEvent, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ChartNoAxesCombined,
  Coins,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Send,
  Sun,
  UserCircle,
  WalletCards
} from "lucide-react";
import "./styles.css";

type TabID = "trader" | "builder" | "asset-manager" | "health";
type Theme = "light" | "dark";

type User = {
  id: string;
  name?: string;
  nickname?: string;
  email?: string;
};

type Session = {
  authenticated: boolean;
  auth_enabled: boolean;
  user?: User;
  login_url: string;
  logout_url: string;
};

type Holding = {
  code: string;
  name: string;
  qty: string;
  avg_price: string;
  cur_price: string;
  eval_amt: string;
  pnl_amt: string;
  pnl_rate: string;
};

type AssetResult = {
  error?: string;
  diagnostics?: {
    domestic_tr_id?: string;
    domestic_output2_rows: number;
    domestic_cash_tr_id?: string;
    domestic_cash_msg_code?: string;
    domestic_cash_msg?: string;
    domestic_cash_error?: string;
    foreign_tr_id?: string;
    foreign_msg_code?: string;
    foreign_msg?: string;
    foreign_output2_rows: number;
    foreign_output3_rows: number;
    foreign_error?: string;
  };
  summary?: {
    cash_amt: string;
    cash_krw: string;
    cash_usd: string;
    cash_usd_krw: string;
    stock_amt: string;
    total_amt: string;
    buy_amt: string;
    pnl_amt: string;
  };
  holdings?: Holding[];
};

type CryptoAsset = {
  currency: string;
  balance: string;
  avg_buy_price: string;
  cur_price: string;
  eval_amt: string;
  pnl_amt: string;
  pnl_rate: string;
};

type CryptoResult = {
  error?: string;
  krw_balance?: string;
  total_eval?: string;
  total_pnl?: string;
  assets?: CryptoAsset[];
};

type HealthResult = {
  cpu_percent: number;
  mem_percent: number;
  mem_used_gb: number;
  mem_total_gb: number;
  disk_percent: number;
  disk_used_gb: number;
  disk_total_gb: number;
};

type CommandResult = {
  reply?: string;
  error?: string;
};

type OverviewSlice = {
  label: string;
  value: number;
  display: string;
  color: string;
};

const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

const tabs: Record<TabID, { title: string; sub: string; icon: React.ComponentType<{ size?: number }> }> = {
  trader: { title: "Trader", sub: "Trader workspace", icon: ChartNoAxesCombined },
  builder: { title: "Website Builder", sub: "Website Builder workspace", icon: WalletCards },
  "asset-manager": { title: "Asset Manager", sub: "Portfolio workspace", icon: Coins },
  health: { title: "OpenClaw Health", sub: "Mac Mini 실시간 모니터링", icon: Activity }
};

function apiURL(path: string) {
  return `${apiBase}${path}`;
}

function appURL(path: string) {
  return path;
}

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiURL(path), {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {})
    }
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}

function krw(value?: string) {
  const n = parseAmount(value);
  if (Number.isNaN(n)) return value || "-";
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

function usd(value?: string) {
  const n = parseAmount(value);
  if (Number.isNaN(n)) return value || "-";
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function num(value?: string) {
  const n = parseAmount(value);
  if (Number.isNaN(n)) return value || "-";
  return n.toLocaleString("ko-KR", { maximumFractionDigits: 4 });
}

function signedKRW(value?: string) {
  const n = parseAmount(value);
  if (Number.isNaN(n)) return krw(value);
  return `${n >= 0 ? "+" : ""}${krw(value)}`;
}

function kisDiagnosticMessages(diagnostics?: AssetResult["diagnostics"]) {
  if (!diagnostics) return [];
  const messages: string[] = [];
  if (diagnostics.domestic_output2_rows === 0) {
    messages.push(`국내 잔고조회(${diagnostics.domestic_tr_id || "TR"}) 응답에 예수금 요약(output2)이 없습니다.`);
  }
  if (diagnostics.domestic_cash_error) {
    messages.push(diagnostics.domestic_cash_error);
  }
  if (diagnostics.domestic_cash_msg_code && diagnostics.domestic_cash_msg_code !== "MCA00000") {
    messages.push(`원화 매수가능금액 조회 메시지 ${diagnostics.domestic_cash_msg_code}: ${diagnostics.domestic_cash_msg || "-"}`);
  }
  if (diagnostics.foreign_error) {
    messages.push(diagnostics.foreign_error);
  } else if ((diagnostics.foreign_output2_rows || 0) + (diagnostics.foreign_output3_rows || 0) === 0) {
    messages.push(`외화 잔고조회(${diagnostics.foreign_tr_id || "TR"}) 응답에 외화 예수금 행이 없습니다.`);
  }
  if (diagnostics.foreign_msg_code && diagnostics.foreign_msg_code !== "MCA00000") {
    messages.push(`외화 잔고조회 메시지 ${diagnostics.foreign_msg_code}: ${diagnostics.foreign_msg || "-"}`);
  }
  return messages;
}

function parseAmount(value?: string) {
  return Number.parseFloat((value || "").replace(/,/g, ""));
}

function pnlClass(value?: string) {
  const n = Number.parseFloat(value || "0");
  return n >= 0 ? "pos" : "neg";
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [activeTab, setActiveTab] = useState<TabID>(() => (localStorage.getItem("oc-tab") as TabID) || "trader");
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("oc-theme") as Theme) || "light");
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("oc-sb") === "1");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("oc-theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("oc-tab", activeTab);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem("oc-sb", collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    fetchJSON<Session>("/api/session")
      .then(setSession)
      .catch(() => setSession({ authenticated: false, auth_enabled: true, login_url: "/login/naver", logout_url: "/logout" }));
  }, []);

  const page = tabs[activeTab];

  if (!session) {
    return <div className="boot">OpenClaw</div>;
  }

  if (!session.authenticated) {
    return <LoginView session={session} theme={theme} onTheme={() => setTheme(theme === "dark" ? "light" : "dark")} />;
  }

  return (
    <div className={`shell ${collapsed ? "collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brandMark">OC</span>
          <div className="brandText">
            <strong>OpenClaw</strong>
            <span>Assistant Console</span>
          </div>
        </div>
        <nav className="nav">
          {(Object.keys(tabs) as TabID[]).map((id) => {
            const Icon = tabs[id].icon;
            return (
              <button key={id} type="button" className={`navItem ${activeTab === id ? "active" : ""}`} onClick={() => setActiveTab(id)}>
                <Icon size={18} />
                <span>{tabs[id].title}</span>
              </button>
            );
          })}
        </nav>
        <div className="sideFooter">
          <UserCircle size={22} />
          <div className="userMeta">
            <strong>{session.user?.nickname || session.user?.id}</strong>
            <span>{session.user?.id}</span>
          </div>
          <IconButton label="테마" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </IconButton>
          <IconButton label="사이드바" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </IconButton>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{page.title}</h1>
            <p>{page.sub}</p>
          </div>
          <div className="topActions">
            <span>{session.user?.nickname || session.user?.name || ""}</span>
            <a className="logout" href={appURL(session.logout_url)}>
              <LogOut size={15} />
              로그아웃
            </a>
          </div>
        </header>
        <section className="content">
          {activeTab === "asset-manager" ? <AssetManager /> : activeTab === "health" ? <HealthPanel /> : <CommandPanel tab={activeTab} />}
        </section>
      </main>
    </div>
  );
}

function LoginView({ session, theme, onTheme }: { session: Session; theme: Theme; onTheme: () => void }) {
  return (
    <div className="loginWrap">
      <div className="loginCard">
        <div className="loginMark">OC</div>
        <h1>OpenClaw</h1>
        <p>계속하려면 네이버 계정으로 로그인하세요.</p>
        {session.auth_enabled ? (
          <a className="primaryAction" href={appURL(session.login_url)}>
            네이버로 로그인
          </a>
        ) : (
          <div className="errorBox">네이버 로그인이 설정되지 않았습니다.</div>
        )}
      </div>
      <IconButton label="테마" onClick={onTheme}>
        {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
      </IconButton>
    </div>
  );
}

function CommandPanel({ tab }: { tab: TabID }) {
  const [command, setCommand] = useState("");
  const [result, setResult] = useState<CommandResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const data = await fetchJSON<CommandResult>("/api/command", {
        method: "POST",
        body: JSON.stringify({ tab, command })
      });
      setResult(data);
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : "명령 실행에 실패했습니다." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="workspace">
      <form className="cmdCard" onSubmit={submit}>
        <label htmlFor="command">명령</label>
        <textarea id="command" value={command} onChange={(event) => setCommand(event.target.value)} placeholder="OpenClaw에게 시킬 일을 입력하세요" />
        <div className="actions">
          <button className="primaryButton" type="submit" disabled={loading}>
            <Send size={16} />
            {loading ? "전송 중" : "보내기"}
          </button>
        </div>
      </form>
      {result?.error && <div className="result error">{result.error}</div>}
      {result?.reply && <div className="result">{result.reply}</div>}
    </div>
  );
}

function AssetManager() {
  const [stock, setStock] = useState<AssetResult | null>(null);
  const [crypto, setCrypto] = useState<CryptoResult | null>(null);
  const [stockTs, setStockTs] = useState("");
  const [cryptoTs, setCryptoTs] = useState("");

  const loadStocks = async () => {
    const data = await fetchJSON<AssetResult>("/api/assets");
    setStock(data);
    setStockTs(new Date().toLocaleTimeString("ko-KR"));
  };

  const loadCrypto = async () => {
    const data = await fetchJSON<CryptoResult>("/api/crypto");
    setCrypto(data);
    setCryptoTs(new Date().toLocaleTimeString("ko-KR"));
  };

  useEffect(() => {
    loadStocks().catch((error) => setStock({ error: error instanceof Error ? error.message : "주식 잔고를 불러오지 못했습니다." }));
    loadCrypto().catch((error) => setCrypto({ error: error instanceof Error ? error.message : "업비트 잔고를 불러오지 못했습니다." }));
  }, []);

  const summary = stock?.summary;
  const holdings = stock?.holdings || [];
  const cryptoAssets = crypto?.assets || [];
  const kisWarnings = kisDiagnosticMessages(stock?.diagnostics);
  const krwCash = Math.max(0, parseAmount(summary?.cash_krw || summary?.cash_amt) || 0) + Math.max(0, parseAmount(crypto?.krw_balance) || 0);
  const cryptoTotal = Math.max(0, parseAmount(crypto?.total_eval) || 0);
  const cryptoOnly = Math.max(0, cryptoTotal - (parseAmount(crypto?.krw_balance) || 0));
  const overviewSlices: OverviewSlice[] = [
    { label: "코인", value: cryptoOnly, display: krw(String(cryptoOnly)), color: "#00b894" },
    { label: "달러", value: Math.max(0, parseAmount(summary?.cash_usd_krw) || 0), display: usd(summary?.cash_usd), color: "#7c3aed" },
    { label: "원화", value: krwCash, display: krw(String(krwCash)), color: "#f59f00" },
    { label: "주식", value: Math.max(0, parseAmount(summary?.stock_amt) || 0), display: krw(summary?.stock_amt), color: "#3182f6" }
  ];

  return (
    <div className="workspace">
      <PortfolioOverview slices={overviewSlices} />
      {stock?.error && <div className="errorBox">{stock.error}</div>}
      {kisWarnings.length > 0 && (
        <div className="warningBox">
          {kisWarnings.map((message) => (
            <div key={message}>{message}</div>
          ))}
        </div>
      )}
      <div className="summaryGrid">
        <SummaryCard label="총 평가금액" value={krw(summary?.total_amt)} />
        <SummaryCard label="원화 현금" value={krw(summary?.cash_krw || summary?.cash_amt)} />
        <SummaryCard label="달러 현금" value={usd(summary?.cash_usd)} />
        <SummaryCard label="평가손익" value={signedKRW(summary?.pnl_amt)} tone={pnlClass(summary?.pnl_amt)} sub={`매입금액 ${krw(summary?.buy_amt)}`} />
      </div>
      <DataCard title="보유종목" timestamp={stockTs} onRefresh={loadStocks}>
        <HoldingsTable holdings={holdings} />
      </DataCard>

      <Divider label="업비트 코인" />
      {crypto?.error && <div className="errorBox">{crypto.error}</div>}
      <div className="summaryGrid">
        <SummaryCard label="코인 총 평가" value={krw(crypto?.total_eval)} />
        <SummaryCard label="원화 잔고" value={krw(crypto?.krw_balance)} />
        <SummaryCard label="코인 평가손익" value={signedKRW(crypto?.total_pnl)} tone={pnlClass(crypto?.total_pnl)} />
      </div>
      <DataCard title="보유 코인" timestamp={cryptoTs} onRefresh={loadCrypto}>
        <CryptoTable assets={cryptoAssets} />
      </DataCard>
    </div>
  );
}

function PortfolioOverview({ slices }: { slices: OverviewSlice[] }) {
  const total = slices.reduce((sum, item) => sum + item.value, 0);
  let cursor = 0;
  const gradient = total > 0
    ? slices
        .filter((item) => item.value > 0)
        .map((item) => {
          const start = cursor;
          cursor += (item.value / total) * 100;
          return `${item.color} ${start}% ${cursor}%`;
        })
        .join(", ")
    : "var(--line) 0% 100%";

  return (
    <section className="overviewPanel">
      <div className="overviewDonutWrap">
        <div className="donutChart" style={{ background: `conic-gradient(${gradient})` }} role="img" aria-label="포트폴리오 비중 도넛 차트">
          <div className="donutHole">
            <span>총자산</span>
            <strong>{krw(String(total))}</strong>
          </div>
        </div>
      </div>
      <div className="overviewLegend">
        {slices.map((item) => {
          const pct = total > 0 ? (item.value / total) * 100 : 0;
          return (
            <div className="legendItem" key={item.label}>
              <span className="legendSwatch" style={{ background: item.color }} />
              <div>
                <strong>{item.label}</strong>
                <span>{item.display}</span>
              </div>
              <em>{pct.toFixed(1)}%</em>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function HealthPanel() {
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [updatedAt, setUpdatedAt] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      const data = await fetchJSON<HealthResult>("/api/health");
      if (!active) return;
      setHealth(data);
      setUpdatedAt(new Date().toLocaleTimeString("ko-KR"));
    }
    load().catch(() => undefined);
    const timer = window.setInterval(() => load().catch(() => undefined), 2000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="workspace">
      <div className="healthGrid">
        <HealthCard label="CPU" percent={health?.cpu_percent || 0} detail="" />
        <HealthCard label="Memory" percent={health?.mem_percent || 0} detail={health ? `${health.mem_used_gb.toFixed(1)} GB / ${health.mem_total_gb.toFixed(1)} GB` : ""} />
        <HealthCard label="Storage" percent={health?.disk_percent || 0} detail={health ? `${health.disk_used_gb.toFixed(1)} GB / ${health.disk_total_gb.toFixed(1)} GB` : ""} />
      </div>
      <div className="timestamp">{updatedAt ? `마지막 업데이트 ${updatedAt}` : ""}</div>
    </div>
  );
}

function SummaryCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="summaryCard">
      <div className="cardLabel">{label}</div>
      <div className={`cardValue ${tone || ""}`}>{value}</div>
      {sub && <div className="cardSub">{sub}</div>}
    </div>
  );
}

function DataCard({ title, timestamp, onRefresh, children }: { title: string; timestamp: string; onRefresh: () => Promise<void>; children: React.ReactNode }) {
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="dataCard">
      <div className="dataHeader">
        <h2>{title}</h2>
        <div className="dataMeta">
          <span>{timestamp ? `${timestamp} 기준` : ""}</span>
          <button type="button" className="ghostButton" onClick={refresh} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? "spin" : ""} />
            새로고침
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}

function HoldingsTable({ holdings }: { holdings: Holding[] }) {
  if (holdings.length === 0) return <div className="empty">보유 종목이 없습니다.</div>;
  return (
    <table className="dataTable">
      <thead>
        <tr>
          <th>종목</th>
          <th>수량</th>
          <th>평균단가</th>
          <th>현재가</th>
          <th>평가금액</th>
          <th>손익</th>
        </tr>
      </thead>
      <tbody>
        {holdings.map((item) => (
          <tr key={item.code}>
            <td data-label="종목">
              <strong>{item.name}</strong>
              <span>{item.code}</span>
            </td>
            <td data-label="수량">{num(item.qty)}</td>
            <td data-label="평균단가">{num(item.avg_price)}</td>
            <td data-label="현재가">{num(item.cur_price)}</td>
            <td data-label="평가금액">{krw(item.eval_amt)}</td>
            <td data-label="손익" className={pnlClass(item.pnl_rate)}>
              {Number.parseFloat(item.pnl_rate || "0") >= 0 ? "+" : ""}
              {(Number.parseFloat(item.pnl_rate || "0") || 0).toFixed(2)}%
              <span>{signedKRW(item.pnl_amt)}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CryptoTable({ assets }: { assets: CryptoAsset[] }) {
  if (assets.length === 0) return <div className="empty">보유 코인이 없습니다.</div>;
  return (
    <table className="dataTable">
      <thead>
        <tr>
          <th>코인</th>
          <th>보유수량</th>
          <th>평균단가</th>
          <th>현재가</th>
          <th>평가금액</th>
          <th>손익</th>
        </tr>
      </thead>
      <tbody>
        {assets.map((item) => (
          <tr key={item.currency}>
            <td data-label="코인">
              <strong>{item.currency}</strong>
              <span>KRW-{item.currency}</span>
            </td>
            <td data-label="보유수량">{item.balance}</td>
            <td data-label="평균단가">{num(item.avg_buy_price)}</td>
            <td data-label="현재가">{num(item.cur_price)}</td>
            <td data-label="평가금액">{krw(item.eval_amt)}</td>
            <td data-label="손익" className={pnlClass(item.pnl_rate)}>
              {Number.parseFloat(item.pnl_rate || "0") >= 0 ? "+" : ""}
              {(Number.parseFloat(item.pnl_rate || "0") || 0).toFixed(2)}%
              <span>{signedKRW(item.pnl_amt)}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function HealthCard({ label, percent, detail }: { label: string; percent: number; detail: string }) {
  const state = percent >= 90 ? "crit" : percent >= 75 ? "warn" : "";
  return (
    <div className="healthCard">
      <div className="cardLabel">{label}</div>
      <div className="healthValue">
        {percent.toFixed(1)}
        <span>%</span>
      </div>
      <div className="track">
        <div className={`fill ${state}`} style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
      <div className="cardSub">{detail}</div>
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="divider">
      <span />
      <strong>{label}</strong>
      <span />
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className="iconButton" title={label} aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
