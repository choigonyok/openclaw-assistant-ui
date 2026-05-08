import React, { FormEvent, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  BotMessageSquare,
  ChartNoAxesCombined,
  Coins,
  Globe,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Send,
  Sun,
  TrendingUp,
  UserCircle
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
  market?: string;
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
    domestic_output1_rows: number;
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
  builder: { title: "Website Manager", sub: "사이트 상태 및 트래픽 대시보드", icon: Globe },
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
  const text = await response.text();
  if (!response.ok) {
    throw new Error(formatHTTPError(response.status, text));
  }
  return (text ? JSON.parse(text) : {}) as T;
}

function formatHTTPError(status: number, text: string) {
  try {
    const parsed = JSON.parse(text) as { error?: string };
    if (parsed.error) return parsed.error;
  } catch {
    // Some upstream errors are plain text or HTML.
  }
  const title = text.match(/<title>(.*?)<\/title>/is)?.[1]?.replace(/\s+/g, " ").trim();
  if (title?.includes("502: Bad gateway") || text.includes("Error code 502")) {
    return "Cloudflare 502 Bad gateway: assistant 서버 또는 프록시가 요청을 처리하지 못했습니다. 컨테이너/터널 로그를 확인하세요.";
  }
  if (title) return `${status} ${title}`;
  return text.replace(/\s+/g, " ").trim() || `HTTP ${status}`;
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

function kisDiagnosticMessages(diagnostics?: AssetResult["diagnostics"], holdingsCount?: number) {
  if (!diagnostics) return [];
  const messages: string[] = [];
  if ((diagnostics.domestic_output1_rows ?? 0) > 0 && holdingsCount === 0) {
    messages.push(`국내 잔고조회(${diagnostics.domestic_tr_id || "TR"}) output1에 ${diagnostics.domestic_output1_rows}개 항목이 있으나 수량이 모두 0으로 표시됩니다. KIS_MOCK 설정이나 계좌번호를 확인하세요.`);
  }
  if (diagnostics.domestic_output2_rows === 0) {
    messages.push(`국내 잔고조회(${diagnostics.domestic_tr_id || "TR"}) 응답에 예수금 요약(output2)이 없습니다.`);
  }
  if (diagnostics.domestic_cash_error) {
    messages.push(diagnostics.domestic_cash_error);
  }
  if (diagnostics.foreign_error) {
    messages.push(diagnostics.foreign_error);
  } else if ((diagnostics.foreign_output2_rows || 0) + (diagnostics.foreign_output3_rows || 0) === 0) {
    messages.push(`외화 잔고조회(${diagnostics.foreign_tr_id || "TR"}) 응답에 외화 예수금 행이 없습니다.`);
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
          {activeTab === "asset-manager" ? <AssetManager /> : activeTab === "health" ? <HealthPanel /> : activeTab === "builder" ? <WebsiteManager /> : <CommandPanel tab={activeTab} />}
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

type SiteInfo = {
  id: string;
  name: string;
  cf_status: string;
  plan: string;
  health: string;
  http_status: number;
  response_ms: number;
  requests_today: number;
  page_views_today: number;
  uniques_today: number;
  bandwidth_today: number;
  requests_7d: number;
  page_views_7d: number;
  uniques_7d: number;
  bandwidth_7d: number;
  stats_error?: string;
  is_subdomain?: boolean;
  parent_zone?: string;
  dns_type?: string;
  dns_content?: string;
  dns_error?: string;
};

type SitesResult = {
  sites: SiteInfo[];
  error?: string;
};

const GA_PROPERTY_ID = (import.meta.env.VITE_GA_PROPERTY_ID || "").trim();

type GaRow = {
  pageViewsToday: number;
  activeUsersToday: number;
  pageViews7d: number;
  activeUsers7d: number;
};
type GaStatsMap = Record<string, GaRow>;

type GaApiRow = {
  dimensionValues: { value: string }[];
  metricValues: { value: string }[];
};

async function fetchGaRange(startDate: string, endDate: string): Promise<GaApiRow[]> {
  const payload: Record<string, unknown> = {
    query: {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "hostname" }],
      metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
    },
  };
  if (GA_PROPERTY_ID) payload.property_id = GA_PROPERTY_ID;

  const result = await fetchJSON<{ rows?: GaApiRow[] }>("/api/google/analytics/run-report", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return result.rows ?? [];
}

async function fetchGaStats(): Promise<GaStatsMap> {
  const [todayRows, sevenDayRows] = await Promise.all([
    fetchGaRange("today", "today"),
    fetchGaRange("7daysAgo", "today"),
  ]);
  const map: GaStatsMap = {};

  for (const row of todayRows) {
    const host = row.dimensionValues[0].value;
    const pv = parseInt(row.metricValues[0].value || "0", 10);
    const users = parseInt(row.metricValues[1].value || "0", 10);
    if (!map[host]) map[host] = { pageViewsToday: 0, activeUsersToday: 0, pageViews7d: 0, activeUsers7d: 0 };
    map[host].pageViewsToday = pv;
    map[host].activeUsersToday = users;
  }

  for (const row of sevenDayRows) {
    const host = row.dimensionValues[0].value;
    const pv = parseInt(row.metricValues[0].value || "0", 10);
    const users = parseInt(row.metricValues[1].value || "0", 10);
    if (!map[host]) map[host] = { pageViewsToday: 0, activeUsersToday: 0, pageViews7d: 0, activeUsers7d: 0 };
    map[host].pageViews7d = pv;
    map[host].activeUsers7d = users;
  }

  return map;
}

function apiErrorMessage(message?: string | null) {
  if (!message) return "";
  const googleMessage = message.match(/"message"\s*:\s*"([^"]+)"/)?.[1];
  if (googleMessage) return googleMessage;
  return message.replace(/\s+/g, " ").trim();
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

function WebsiteManager() {
  const [data, setData] = useState<SitesResult | null>(null);
  const [gaStats, setGaStats] = useState<GaStatsMap>({});
  const [gaError, setGaError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ts, setTs] = useState("");

  const load = async () => {
    setLoading(true);
    const [sitesRes, gaRes] = await Promise.allSettled([
      fetchJSON<SitesResult>("/api/sites"),
      fetchGaStats(),
    ]);
    setData(sitesRes.status === "fulfilled" ? sitesRes.value : { sites: [], error: (sitesRes.reason as Error).message });
    if (gaRes.status === "fulfilled") { setGaStats(gaRes.value); setGaError(null); }
    else { setGaStats({}); setGaError((gaRes.reason as Error).message); }
    setTs(new Date().toLocaleTimeString("ko-KR"));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const sites = data?.sites || [];
  const zones = sites.filter((s) => !s.is_subdomain);
  const subdomains = sites.filter((s) => s.is_subdomain);
  const totalReqs7d = zones.reduce((s, x) => s + x.requests_7d, 0);
  const totalReqsToday = zones.reduce((s, x) => s + x.requests_today, 0);
  const upCount = sites.filter((x) => x.health === "up").length;
  const totalGaPv7d = Object.values(gaStats).reduce((s, x) => s + x.pageViews7d, 0);
  const gaErrorDetail = apiErrorMessage(gaError);

  const subsByZone: Record<string, SiteInfo[]> = {};
  for (const sub of subdomains) {
    const key = sub.parent_zone || "";
    if (!subsByZone[key]) subsByZone[key] = [];
    subsByZone[key].push(sub);
  }

  return (
    <div className="workspace">
      {data?.error && <div className="errorBox">{data.error}</div>}
      {gaErrorDetail && <div className="errorBox">GA 연결 실패: {gaErrorDetail}</div>}
      <div className="summaryGrid">
        <SummaryCard label="루트 도메인" value={String(zones.length)} sub={`서브도메인 ${subdomains.length}개 · 정상 ${upCount}개`} />
        <SummaryCard label="CF 오늘 요청" value={totalReqsToday.toLocaleString("ko-KR")} sub="Cloudflare · 루트 합산" />
        <SummaryCard label="CF 7일 요청" value={totalReqs7d.toLocaleString("ko-KR")} sub="Cloudflare · 루트 합산" />
        <SummaryCard
          label="GA 7일 페이지뷰"
          value={gaError ? "오류" : totalGaPv7d.toLocaleString("ko-KR")}
          sub={gaError ? "상세 오류를 상단에 표시했습니다" : "Google Analytics · 봇 제외"}
        />
      </div>
      <DataCard title="사이트 목록" timestamp={ts} onRefresh={load}>
        {loading ? (
          <div className="empty">불러오는 중...</div>
        ) : sites.length === 0 && !data?.error ? (
          <div className="empty">Cloudflare에 등록된 사이트가 없습니다.</div>
        ) : (
          <div className="siteZoneList">
            {zones.map((zone) => (
              <div key={zone.id} className="siteZoneGroup">
                <SiteCard site={zone} ga={gaStats[zone.name]} />
                {subsByZone[zone.name] && subsByZone[zone.name].length > 0 && (
                  <div className="subdomainList">
                    {subsByZone[zone.name].map((sub) => (
                      <SubdomainCard key={sub.id} site={sub} ga={gaStats[sub.name]} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DataCard>
    </div>
  );
}

function SiteCard({ site, ga }: { site: SiteInfo; ga?: GaRow }) {
  const healthLabel = site.health === "up" ? "정상" : site.health === "degraded" ? "저하" : site.health === "down" ? "오류" : "확인중";
  return (
    <div className="siteCard">
      <div className="siteCardHead">
        <a className="siteName" href={`https://${site.name}`} target="_blank" rel="noopener noreferrer">
          {site.name}
        </a>
        <div className="siteBadges">
          <span className={`badge badge-health-${site.health || "unknown"}`}>{healthLabel}</span>
          {site.cf_status && <span className={`badge badge-cf-${site.cf_status}`}>{site.cf_status}</span>}
        </div>
      </div>
      <div className="siteMeta">
        {site.response_ms > 0 && <span>{site.response_ms}ms</span>}
        {site.http_status > 0 && <span>HTTP {site.http_status}</span>}
        {site.plan && <span>{site.plan}</span>}
      </div>
      {site.dns_error && <div className="siteStatsError">DNS 조회 실패: {site.dns_error}</div>}
      {site.stats_error ? (
        <div className="siteStatsError">{site.stats_error}</div>
      ) : (
        <div className="siteMetrics">
          <div className="siteMetric">
            <span>CF 오늘 요청</span>
            <strong>{site.requests_today.toLocaleString("ko-KR")}</strong>
          </div>
          <div className="siteMetric">
            <span>CF 7일 요청</span>
            <strong>{site.requests_7d.toLocaleString("ko-KR")}</strong>
          </div>
          <div className="siteMetric">
            <span>CF 7일 방문자</span>
            <strong>{site.uniques_7d.toLocaleString("ko-KR")}</strong>
          </div>
          <div className="siteMetric siteMetricGa">
            <span>GA 오늘 PV</span>
            <strong>{ga ? ga.pageViewsToday.toLocaleString("ko-KR") : "—"}</strong>
          </div>
          <div className="siteMetric siteMetricGa">
            <span>GA 7일 PV</span>
            <strong>{ga ? ga.pageViews7d.toLocaleString("ko-KR") : "—"}</strong>
          </div>
          <div className="siteMetric siteMetricGa">
            <span>GA 7일 사용자</span>
            <strong>{ga ? ga.activeUsers7d.toLocaleString("ko-KR") : "—"}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

function SubdomainCard({ site, ga }: { site: SiteInfo; ga?: GaRow }) {
  const healthLabel = site.health === "up" ? "정상" : site.health === "degraded" ? "저하" : site.health === "down" ? "오류" : "확인중";
  const subdomain = site.name.replace(`.${site.parent_zone}`, "");
  return (
    <div className="subdomainCard">
      <div className="subdomainCardHead">
        <div className="subdomainName">
          <span className="subdomainPrefix">↳</span>
          <a href={`https://${site.name}`} target="_blank" rel="noopener noreferrer">
            <strong>{subdomain}</strong>
            <span className="subdomainSuffix">.{site.parent_zone}</span>
          </a>
          {site.dns_type && <span className="subdomainDnsType">{site.dns_type}</span>}
        </div>
        <div className="siteBadges">
          <span className={`badge badge-health-${site.health || "unknown"}`}>{healthLabel}</span>
        </div>
      </div>
      <div className="siteMeta">
        {site.response_ms > 0 && <span>{site.response_ms}ms</span>}
        {site.http_status > 0 && <span>HTTP {site.http_status}</span>}
        {site.dns_content && <span className="subdomainTarget" title={site.dns_content}>{site.dns_content.length > 30 ? site.dns_content.slice(0, 30) + "…" : site.dns_content}</span>}
      </div>
      {ga && (
        <div className="subdomainGa">
          <div className="subdomainGaItem">
            <span>오늘 PV</span>
            <strong>{ga.pageViewsToday.toLocaleString("ko-KR")}</strong>
          </div>
          <div className="subdomainGaItem">
            <span>7일 PV</span>
            <strong>{ga.pageViews7d.toLocaleString("ko-KR")}</strong>
          </div>
          <div className="subdomainGaItem">
            <span>7일 사용자</span>
            <strong>{ga.activeUsers7d.toLocaleString("ko-KR")}</strong>
          </div>
        </div>
      )}
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

type AssetSubTab = "portfolio" | "trading";

function AssetManager() {
  const [sub, setSub] = useState<AssetSubTab>("portfolio");
  return (
    <div className="workspace">
      <div className="subTabBar">
        <button type="button" className={`subTabBtn ${sub === "portfolio" ? "active" : ""}`} onClick={() => setSub("portfolio")}>
          <Coins size={15} /> 포트폴리오
        </button>
        <button type="button" className={`subTabBtn ${sub === "trading" ? "active" : ""}`} onClick={() => setSub("trading")}>
          <BotMessageSquare size={15} /> 퀀트봇
        </button>
      </div>
      {sub === "portfolio" ? <PortfolioPanel /> : <TradingPanel />}
    </div>
  );
}

function PortfolioPanel() {
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
  const kisWarnings = kisDiagnosticMessages(stock?.diagnostics, holdings.length);
  const krwCash = Math.max(0, parseAmount(summary?.cash_krw || summary?.cash_amt) || 0) + Math.max(0, parseAmount(crypto?.krw_balance) || 0);
  const stockAccountTotal = Math.max(0, parseAmount(summary?.total_amt) || 0) + Math.max(0, parseAmount(summary?.cash_usd_krw) || 0);
  const cryptoTotal = Math.max(0, parseAmount(crypto?.total_eval) || 0);
  const cryptoOnly = Math.max(0, cryptoTotal - (parseAmount(crypto?.krw_balance) || 0));
  const overviewSlices: OverviewSlice[] = [
    { label: "코인", value: cryptoOnly, display: krw(String(cryptoOnly)), color: "#00b894" },
    { label: "달러", value: Math.max(0, parseAmount(summary?.cash_usd_krw) || 0), display: krw(summary?.cash_usd_krw), color: "#7c3aed" },
    { label: "원화", value: krwCash, display: krw(String(krwCash)), color: "#f59f00" },
    { label: "주식", value: Math.max(0, parseAmount(summary?.stock_amt) || 0), display: krw(summary?.stock_amt), color: "#3182f6" }
  ];

  return (
    <>
      <PortfolioOverview slices={overviewSlices} />
      {stock?.error && <div className="errorBox">{stock.error}</div>}
      {kisWarnings.length > 0 && (
        <div className="warningBox">
          {kisWarnings.map((message) => (
            <div key={message}>{message}</div>
          ))}
        </div>
      )}
      <Divider label="주식/금현물" />
      <div className="summaryGrid">
        <SummaryCard label="주식 총 평가" value={krw(summary ? String(stockAccountTotal) : undefined)} />
        <SummaryCard label="원화 현금" value={krw(summary?.cash_krw || summary?.cash_amt)} />
        <SummaryCard label="달러 현금" value={krw(summary?.cash_usd_krw)} sub={usd(summary?.cash_usd)} />
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
    </>
  );
}

// ── Trading types ─────────────────────────────────────────────────────────────

type TradeRecord = {
  id: string;
  action: "BUY" | "SELL";
  price: number;
  btc_qty: number;
  krw_amt: number;
  reason: string;
  timestamp: string;
};

type TradingPosition = {
  entry_price: number;
  entry_date: string;
  btc_qty: number;
  trail_high: number;
  trail_stop: number;
};

type TradingStatus = {
  error?: string;
  in_position: boolean;
  position?: TradingPosition;
  last_exit_date: string;
  history: TradeRecord[];
  paused: boolean;
  last_checked: string;
  last_signal: string;
  current_price: number;
  current_rsi: number;
  current_ema5: number;
  current_ema20: number;
  current_atr?: number;
  vol_ratio: number;
  dry_run: boolean;
  total_capital_in?: number;
  cash_krw?: number;
  btc_qty?: number;
  btc_eval_krw?: number;
};

// ── TradingPanel ──────────────────────────────────────────────────────────────

function TradingPanel() {
  const [status, setStatus] = useState<TradingStatus | null>(null);
  const [ts, setTs] = useState("");
  const [controlling, setControlling] = useState(false);
  const [showCapitalForm, setShowCapitalForm] = useState(false);
  const [capitalAction, setCapitalAction] = useState<"deposit" | "withdraw" | "set_capital">("deposit");
  const [capitalAmount, setCapitalAmount] = useState("");

  const load = async () => {
    try {
      const data = await fetchJSON<TradingStatus>("/api/trading/status");
      setStatus(data);
      setTs(new Date().toLocaleTimeString("ko-KR"));
    } catch (error) {
      setStatus({ error: error instanceof Error ? error.message : "퀀트봇 상태를 불러오지 못했습니다.", in_position: false, history: [], paused: false, last_checked: "", last_signal: "", current_price: 0, current_rsi: 0, current_ema5: 0, current_ema20: 0, vol_ratio: 0, dry_run: false, last_exit_date: "" });
    }
  };

  useEffect(() => {
    load();
    const t = window.setInterval(load, 60_000);
    return () => window.clearInterval(t);
  }, []);

  const togglePause = async () => {
    if (!status) return;
    setControlling(true);
    try {
      await fetchJSON("/api/trading/control", {
        method: "POST",
        body: JSON.stringify({ action: status.paused ? "resume" : "pause" })
      });
      await load();
    } finally {
      setControlling(false);
    }
  };

  const submitCapitalChange = async (e: FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(capitalAmount);
    if (!Number.isFinite(amount) || amount < 0) return;
    setControlling(true);
    try {
      await fetchJSON("/api/trading/control", {
        method: "POST",
        body: JSON.stringify({ action: capitalAction, amount })
      });
      setCapitalAmount("");
      setShowCapitalForm(false);
      await load();
    } finally {
      setControlling(false);
    }
  };

  if (!status) return <div className="empty">불러오는 중...</div>;

  const pos = status.position;
  const unrealizedPct = pos ? (status.current_price - pos.entry_price) / pos.entry_price * 100 : null;
  const unrealizedKrw = pos ? (status.current_price - pos.entry_price) * pos.btc_qty : null;

  const history = [...(status.history ?? [])].reverse();
  const closedTrades = history.filter(t => t.action === "SELL");
  const totalPnlKrw = (() => {
    let equity = 0;
    let inPos = false;
    let buyKrw = 0;
    for (const t of [...(status.history ?? [])]) {
      if (t.action === "BUY") { inPos = true; buyKrw = t.krw_amt; }
      else if (t.action === "SELL" && inPos) { equity += t.krw_amt - buyKrw; inPos = false; }
    }
    return equity;
  })();

  // 자산 카드 계산
  const cashKRW = status.cash_krw ?? 0;
  const btcEvalKRW = status.btc_eval_krw ?? (pos ? pos.btc_qty * status.current_price : 0);
  const currentTotal = cashKRW + btcEvalKRW;
  const initialCapital = status.total_capital_in ?? 0;
  const capitalChange = currentTotal - initialCapital;
  const capitalChangePct = initialCapital > 0 ? (capitalChange / initialCapital) * 100 : 0;

  return (
    <>
      {status.error && <div className="errorBox">{status.error}</div>}

      {/* Status banner */}
      <div className={`tradingBanner ${status.paused ? "paused" : status.in_position ? "active" : "idle"}`}>
        <div className="tradingBannerLeft">
          <span className="tradingBannerDot" />
          <strong>{status.paused ? "일시 정지" : status.in_position ? "포지션 보유 중" : "대기 중"}</strong>
          {status.dry_run && <span className="tradingDryRun">DRY-RUN</span>}
        </div>
        <button type="button" className={`tradingControlBtn ${status.paused ? "" : "danger"}`} onClick={togglePause} disabled={controlling || !!status.error}>
          {controlling ? "처리 중..." : status.paused ? "재개" : "일시 정지"}
        </button>
      </div>

      {/* 자산 카드 (초기자산 / 현재자산 / 자산 변화율) */}
      <Divider label="자산 현황" />
      <div className="summaryGrid">
        <SummaryCard
          label="초기 자산"
          value={krw(String(Math.round(initialCapital)))}
          sub="누적 입금 - 출금"
          info={
            <div>
              <p>거래 활동과 무관한 <strong>봇에 투입된 순 자본</strong>입니다.</p>
              <p>(첫 실행 시 잔고) + (이후 입금 합계) − (출금 합계) 로 계산됩니다.</p>
              <p>이 값은 매수/매도 손익으로 변하지 않으므로 <strong>자산 변화율</strong> 카드의 분모 역할을 합니다.</p>
              <p>입금/출금이 발생하면 아래 <em>자본 조정</em> 버튼으로 직접 갱신해 주세요.</p>
            </div>
          }
        />
        <SummaryCard
          label="현재 자산"
          value={krw(String(Math.round(currentTotal)))}
          sub={`현금 ${krw(String(Math.round(cashKRW)))} + BTC ${krw(String(Math.round(btcEvalKRW)))}`}
          info={
            <div>
              <p>지금 시점의 <strong>총 평가 자산</strong>입니다.</p>
              <p>= 현재 KRW 잔고 + BTC 보유량 × 현재가</p>
              <p>매 30분 tick마다 Upbit 잔고 API로 갱신됩니다. 포지션이 없으면 KRW 현금 = 현재 자산.</p>
            </div>
          }
        />
        <SummaryCard
          label="자산 변화율"
          value={`${capitalChangePct >= 0 ? "+" : ""}${capitalChangePct.toFixed(2)}%`}
          tone={capitalChange >= 0 ? "pos" : "neg"}
          sub={signedKRW(String(Math.round(capitalChange)))}
          info={
            <div>
              <p>봇이 만들어낸 <strong>순수 트레이딩 수익률</strong>입니다.</p>
              <p>= (현재 자산 − 초기 자산) / 초기 자산 × 100%</p>
              <p>입금/출금은 초기 자산 분모도 함께 갱신되므로 변화율에 영향을 주지 않습니다 — 오직 매매 손익만 반영.</p>
              <p>아래의 <strong>누적 실현 손익</strong> 카드는 청산된 거래만 합산하지만, 이 카드는 <strong>현재 미실현 포지션</strong>까지 포함한 실시간 평가입니다.</p>
            </div>
          }
        />
      </div>

      <div className="capitalAdjustWrap">
        <button type="button" className="ghostButton" onClick={() => setShowCapitalForm((v) => !v)}>
          {showCapitalForm ? "닫기" : "자본 조정 (입금/출금/직접 설정)"}
        </button>
        {showCapitalForm && (
          <form className="capitalAdjustForm" onSubmit={submitCapitalChange}>
            <select value={capitalAction} onChange={(e) => setCapitalAction(e.target.value as typeof capitalAction)}>
              <option value="deposit">입금 (초기 자산 +)</option>
              <option value="withdraw">출금 (초기 자산 −)</option>
              <option value="set_capital">초기 자산 직접 설정</option>
            </select>
            <input
              type="number"
              min="0"
              step="1"
              placeholder="금액 (KRW)"
              value={capitalAmount}
              onChange={(e) => setCapitalAmount(e.target.value)}
              required
            />
            <button type="submit" className="primaryButton" disabled={controlling}>
              {controlling ? "처리 중..." : "적용"}
            </button>
          </form>
        )}
      </div>

      {/* Current indicators */}
      <Divider label="현재 시장 지표" />
      <div className="summaryGrid">
        <SummaryCard
          label="현재 BTC 가격"
          value={krw(String(Math.round(status.current_price)))}
          info={
            <div>
              <p>Upbit 실시간 ticker에서 가져온 KRW-BTC <strong>최근 체결가</strong>입니다.</p>
              <p>매 30분마다 갱신됩니다. 트레일 스톱/매수 결정은 4시간봉 종가 기준이지만, 실시간 모니터링용으로 ticker 가격을 함께 표시합니다.</p>
              <p>큰 가격 변동이 있을 때 봇이 다음 tick에서 어떻게 반응할지 예측하는 데 참고하세요.</p>
            </div>
          }
        />
        <SummaryCard
          label="RSI (14)"
          value={status.current_rsi ? status.current_rsi.toFixed(1) : "-"}
          sub={`EMA(5): ${(status.current_ema5 / 1e6).toFixed(1)}M · EMA(34): ${(status.current_ema20 / 1e6).toFixed(1)}M`}
          info={
            <div>
              <p>RSI(14) = 14봉(4시간 × 14 = 56시간) 동안의 상대강도지수.</p>
              <p>0~100 범위, Wilder smoothing 방식.</p>
              <ul>
                <li><strong>&lt; 25</strong>: 극도의 과매도. 거래량 폭증 동반 시 <em>Entry A (공황 매수)</em> 발동.</li>
                <li><strong>30~50</strong>: 추세 내 눌림목 구간. EMA 정배열 + RSI 반등 + 양봉이면 <em>Entry B</em>.</li>
                <li><strong>50선 돌파</strong>: 모멘텀 회복. EMA 정배열이면 <em>Entry C</em>.</li>
                <li><strong>&gt; 80 + 음봉</strong>: 과열 후 꺾임. <em>RSI Top 매도</em> 발동.</li>
              </ul>
              <p>EMA(5)/EMA(34)는 단기/중기 추세선. EMA(5) &gt; EMA(34)면 정배열(추세 상승).</p>
            </div>
          }
        />
        <SummaryCard
          label="거래량 비율"
          value={status.vol_ratio ? `${status.vol_ratio.toFixed(2)}×` : "-"}
          sub="현재 봉 거래량 / 20봉 평균"
          info={
            <div>
              <p>현재 4시간봉의 거래량을 직전 20봉 평균(SMA20)과 비교한 배수입니다.</p>
              <ul>
                <li><strong>≥ 2.5×</strong>: 비정상적 거래량 폭증. RSI &lt; 25와 함께 충족 시 <em>공황 매수(Entry A)</em>의 핵심 트리거.</li>
                <li><strong>1.0~1.5×</strong>: 평소 수준.</li>
                <li><strong>&lt; 0.5×</strong>: 거래 한산. 신호 신뢰도 낮음.</li>
              </ul>
              <p>큰 가격 변동이 있어도 거래량이 작으면 페이크 무브일 가능성이 높아 봇이 매수를 보류합니다.</p>
            </div>
          }
        />
        <SummaryCard
          label="마지막 신호"
          value={status.last_signal || "-"}
          sub={status.last_checked || ""}
          info={
            <div>
              <p>직전 tick에서 봇이 평가한 결과입니다. 가능한 값:</p>
              <ul>
                <li><code>no signal</code>: 매수 조건 없음 + 보유 안 함</li>
                <li><code>holding — pnl +X%</code>: 보유 중, 트레일 스톱 감시</li>
                <li><code>cooldown (n/1 bars)</code>: 직전 청산 직후, 재진입 대기</li>
                <li><code>waiting for next candle</code>: 같은 4시간봉 재평가는 스킵</li>
                <li><code>bought: ...</code>, <code>sold: ...</code>: 방금 주문 발생</li>
              </ul>
              <p>sub-text는 마지막 tick 시각(KST). 30분 이상 갱신이 없으면 봇이 죽었거나 네트워크 문제일 수 있습니다.</p>
            </div>
          }
        />
      </div>

      {/* Open position */}
      {status.in_position && pos && (
        <>
          <Divider label="현재 포지션" />
          <div className="summaryGrid">
            <SummaryCard
              label="진입가"
              value={krw(String(Math.round(pos.entry_price)))}
              sub={pos.entry_date}
              info={
                <div>
                  <p>현재 보유 중인 BTC를 매수했을 때의 <strong>체결 가격</strong>입니다 (Upbit 시장가 매수 + 슬리피지 0.05% 반영).</p>
                  <p>sub-text는 진입 시각(KST). 미실현 손익의 기준점이 되는 가격입니다.</p>
                </div>
              }
            />
            <SummaryCard
              label="수량"
              value={`${pos.btc_qty.toFixed(8)} BTC`}
              info={
                <div>
                  <p>현재 보유 중인 <strong>BTC 수량</strong>(소수점 8자리, satoshi 단위).</p>
                  <p>주문 직후 잠시 대기하면서 Upbit 잔고 API로 실제 체결 수량을 가져와 기록합니다.</p>
                  <p>주문 수수료 0.05%가 차감된 순수 수령 수량입니다.</p>
                </div>
              }
            />
            <SummaryCard
              label="Trail High"
              value={krw(String(Math.round(pos.trail_high)))}
              sub={`스톱: ${krw(String(Math.round(pos.trail_stop)))}`}
              info={
                <div>
                  <p><strong>Trail High</strong>: 진입 이후 도달한 <strong>최고 종가</strong>입니다. 가격이 새 고점을 찍을 때마다 갱신됩니다.</p>
                  <p><strong>스톱 (sub-text)</strong>: ATR(14) 기반 동적 트레일 스톱.</p>
                  <p style={{ fontFamily: "monospace", fontSize: 12 }}>스톱 = Trail High − ATR(14) × 2.5</p>
                  <p>현재 가격이 스톱 이하로 내려오면 즉시 매도(시장가). ATR이 변동성에 적응하므로 변동성 큰 시기엔 스톱이 멀어지고(휩쏘 방지), 잔잔한 시기엔 가까워집니다.</p>
                </div>
              }
            />
            <SummaryCard
              label="미실현 손익"
              value={unrealizedKrw !== null ? signedKRW(String(Math.round(unrealizedKrw))) : "-"}
              tone={unrealizedPct !== null ? (unrealizedPct >= 0 ? "pos" : "neg") : ""}
              sub={unrealizedPct !== null ? `${unrealizedPct >= 0 ? "+" : ""}${unrealizedPct.toFixed(2)}%` : ""}
              info={
                <div>
                  <p>지금 매도하면 받을 손익(수수료 미차감 추정).</p>
                  <p style={{ fontFamily: "monospace", fontSize: 12 }}>= (현재가 − 진입가) × 수량</p>
                  <p>실제 청산 시에는 슬리피지 0.05% + 수수료 0.05%가 차감되므로 표시값보다 0.1%가량 낮을 수 있습니다.</p>
                  <p>이 값이 음수더라도 트레일 스톱이 발동하지 않은 한 봇은 보유를 유지합니다.</p>
                </div>
              }
            />
          </div>
        </>
      )}

      {/* Closed trades summary */}
      <Divider label="누적 손익 (청산 거래만)" />
      <div className="summaryGrid">
        <SummaryCard
          label="청산 횟수"
          value={`${closedTrades.length}회`}
          info={
            <div>
              <p>봇이 매도(청산)를 실행한 총 횟수 = 완료된 매수→매도 사이클 수.</p>
              <p>현재 보유 중인 미실현 포지션은 포함되지 않습니다. (백테스트 기준 평균 5.1일에 한 번 청산)</p>
            </div>
          }
        />
        <SummaryCard
          label="누적 실현 손익"
          value={signedKRW(String(Math.round(totalPnlKrw)))}
          tone={totalPnlKrw >= 0 ? "pos" : "neg"}
          info={
            <div>
              <p><strong>청산이 끝난 거래</strong>들의 매도금액 − 매수금액 합계.</p>
              <p>현재 미실현 포지션은 빠져있어 위쪽 <em>자산 변화율</em>과 다를 수 있습니다.</p>
              <p>참고: 위 자산 변화율 = 실현손익 + 미실현손익(현재 포지션) 모두 반영.</p>
            </div>
          }
        />
      </div>

      {/* Trade history */}
      <DataCard title="거래 내역" timestamp={ts} onRefresh={load}>
        <TradeHistoryTable trades={history} />
      </DataCard>
    </>
  );
}

function TradeHistoryTable({ trades }: { trades: TradeRecord[] }) {
  if (trades.length === 0) return <div className="empty">거래 내역이 없습니다.</div>;
  return (
    <table className="dataTable">
      <thead>
        <tr>
          <th>일시</th>
          <th>구분</th>
          <th>가격</th>
          <th>수량 (BTC)</th>
          <th>금액 (KRW)</th>
          <th>사유</th>
        </tr>
      </thead>
      <tbody>
        {trades.map((t) => (
          <tr key={t.id}>
            <td data-label="일시">{new Date(t.timestamp).toLocaleString("ko-KR")}</td>
            <td data-label="구분">
              <span className={`tradeBadge ${t.action === "BUY" ? "buy" : "sell"}`}>{t.action === "BUY" ? "매수" : "매도"}</span>
            </td>
            <td data-label="가격">{krw(String(Math.round(t.price)))}</td>
            <td data-label="수량">{t.btc_qty.toFixed(8)}</td>
            <td data-label="금액">{krw(String(Math.round(t.krw_amt)))}</td>
            <td data-label="사유" className="tradeReason">{t.reason}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PortfolioOverview({ slices }: { slices: OverviewSlice[] }) {
  const [activeSlice, setActiveSlice] = useState<OverviewSlice | null>(null);
  const total = slices.reduce((sum, item) => sum + item.value, 0);
  let cursor = 0;
  let segmentCursor = 0;
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
  const segments = total > 0
    ? slices
        .filter((item) => item.value > 0)
        .map((item) => {
          const pct = (item.value / total) * 100;
          const segment = { item, pct, offset: segmentCursor };
          segmentCursor += pct;
          return segment;
        })
    : [];
  const hovered = activeSlice && total > 0 ? { item: activeSlice, pct: (activeSlice.value / total) * 100 } : null;

  return (
    <section className="overviewPanel">
      <div className="overviewDonutWrap">
        <div className="donutChart" style={{ background: `conic-gradient(${gradient})` }} role="img" aria-label="포트폴리오 비중 도넛 차트" onMouseLeave={() => setActiveSlice(null)}>
          <svg className="donutHitArea" viewBox="0 0 120 120" aria-hidden="true">
            {segments.map(({ item, pct, offset }) => (
              <circle
                key={item.label}
                className="donutSegment"
                cx="60"
                cy="60"
                r="44"
                pathLength="100"
                stroke={item.color}
                strokeDasharray={`${pct} ${100 - pct}`}
                strokeDashoffset={-offset}
                onMouseEnter={() => setActiveSlice(item)}
                onFocus={() => setActiveSlice(item)}
              />
            ))}
          </svg>
          {hovered && (
            <div className="donutTooltip">
              <strong>{hovered.item.label}</strong>
              <span>{hovered.pct.toFixed(1)}%</span>
              <em>{hovered.item.display}</em>
            </div>
          )}
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
            <div className={`legendItem ${activeSlice?.label === item.label ? "active" : ""}`} key={item.label} onMouseEnter={() => setActiveSlice(item)} onMouseLeave={() => setActiveSlice(null)}>
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

function SummaryCard({ label, value, sub, tone, info }: { label: string; value: string; sub?: string; tone?: string; info?: React.ReactNode }) {
  const [showInfo, setShowInfo] = useState(false);
  return (
    <div className={`summaryCard ${showInfo ? "infoOpen" : ""}`}>
      <div className="cardLabel">
        <span>{label}</span>
        {info && (
          <button
            type="button"
            className="cardInfoBtn"
            aria-label={`${label} 설명`}
            onClick={() => setShowInfo((v) => !v)}
          >
            i
          </button>
        )}
      </div>
      <div className={`cardValue ${tone || ""}`}>{value}</div>
      {sub && <div className="cardSub">{sub}</div>}
      {info && showInfo && <div className="cardInfoBody">{info}</div>}
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
          <tr key={`${item.market || ""}-${item.code}`}>
            <td data-label="종목">
              <strong>{item.name}</strong>
              <span>
                {item.market && item.market !== "KR" ? `${item.market} · ` : ""}
                {item.code}
              </span>
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
