import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LiveStatus } from "../market/types";

// "auth: …" / "network: …" / "rate-limit" from the Rust side → a sentence for the user
const reason = (e: unknown) => {
  const s = String(e);
  if (s === "rate-limit") return "1분 뒤에 다시 시도해 주세요 (토큰은 1분에 한 번 받아요)";
  if (s.startsWith("auth: ")) return s.slice(6);
  if (s.startsWith("store: ")) return s.slice(7);
  return "연결하지 못했어요. 인터넷 연결을 확인해 주세요";
};

/**
 * US 주간거래 (daytime in Korea) needs the user's own 한국투자증권 Open API app key.
 * One row like the other price sources; "연결" opens a small form. The key goes straight to
 * the Rust side, which keeps it in Windows Credential Manager.
 */
export function KisBox({ status }: { status: LiveStatus }) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [form, setForm] = useState(false);
  const [appkey, setAppkey] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { invoke<boolean>("kis_status").then(setConnected).catch(() => setConnected(false)); }, []);

  const changed = () => window.dispatchEvent(new Event("ticky:kis-changed"));
  const connect = async () => {
    setBusy(true);
    setError("");
    try {
      await invoke("kis_connect", { appkey, appsecret: secret });
      setConnected(true);
      setForm(false);
      setAppkey("");
      setSecret("");
      changed();
    } catch (e) {
      setError(reason(e));
    }
    setBusy(false);
  };
  const disconnect = async () => {
    await invoke("kis_disconnect").catch(() => {});
    setConnected(false);
    changed();
  };

  if (connected === null) return null;
  const dot = connected ? (status === "off" ? "ok" : status) : "off";
  return (
    <>
      <div className="src-row">
        <span className={`dot dot-${dot}`} aria-hidden="true" />
        <span className="src-name" title="한국 낮 시간(뉴욕 밤 8시~새벽 4시) 미국 시세">미국 주간 · 한국투자증권</span>
        {connected ? (
          <button type="button" className="src-btn" onClick={disconnect}>연결 끊기</button>
        ) : (
          <button type="button" className="src-btn" onClick={() => setForm(!form)}>{form ? "닫기" : "연결"}</button>
        )}
      </div>
      {!connected && form && (
        <form className="kis-form" onSubmit={(e) => { e.preventDefault(); if (!busy) connect(); }}>
          <input value={appkey} onChange={(e) => setAppkey(e.target.value)} placeholder="App Key" autoComplete="off" spellCheck={false} autoFocus />
          <input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="App Secret" type="password" autoComplete="off" />
          {error && <p className="notice">{error}</p>}
          <div className="kis-foot">
            <span className="set-hint">이 PC의 자격 증명 관리자에만 저장돼요</span>
            <button type="submit" className="src-btn solid" disabled={busy || !appkey.trim() || !secret.trim()}>{busy ? "확인 중…" : "연결"}</button>
          </div>
        </form>
      )}
    </>
  );
}
