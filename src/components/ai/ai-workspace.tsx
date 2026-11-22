"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bot,
  BrainCircuit,
  Car,
  Check,
  ChevronDown,
  ClipboardList,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  HelpCircle,
  History,
  KeyRound,
  Loader2,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Shield,
  Sparkles,
  Square,
  Trash2,
  UserPlus,
  Wrench,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/context/workspace-context";
import { usePermissions } from "@/lib/context/auth-context";
import { getInvoiceById } from "@/lib/services/invoice-service";
import { getJobCardById } from "@/lib/services/job-card-service";
import { exportElementToPdf } from "@/lib/services/pdf-service";
import { ActionConfirmationCard } from "./action-confirmation-card";
import { ExecutionTimeline } from "./execution-timeline";
import { AIDocumentPreviewModal } from "./ai-document-preview-modal";
import type {
  ActionConfirmationPayload,
  ActionExecutionResult,
  AIChatMessageUI,
  AIConversationThread,
  AIMode,
  AIProvider,
  DocumentActionRef,
  ProviderConnectionStatus,
  ToolActivityLog,
} from "@/lib/ai/types";

const SESSION_THREADS_PREFIX = "atiq_ai_threads_v1_";

interface SuggestedPromptItem {
  id: string;
  label: string;
  description: string;
  prompt: string;
  mode: AIMode;
  autoSend: boolean;
  icon: React.ComponentType<{ className?: string }>;
}

const SUGGESTED_PROMPTS: SuggestedPromptItem[] = [
  {
    id: "create_job_card",
    label: "Create a Job Card",
    description: "Prepare customer, vehicle, services & VAT preview",
    prompt:
      "Create a Job Card for customer [Name], mobile [050XXXXXXX], vehicle [Make Model Year], plate [Plate Number], service [Engine Oil Service] AED [Price], VAT 5%.",
    mode: "agent",
    autoSend: false,
    icon: ClipboardList,
  },
  {
    id: "generate_invoice",
    label: "Generate an Invoice",
    description: "End-to-end Customer → Vehicle → Job Card → Invoice",
    prompt:
      "Create a customer, register their vehicle, create a Job Card, and generate an Invoice with print preview for [Customer Name], [Vehicle Make Model], plate [Plate], services [Service Name AED Price], discount [0], VAT [0% or 5%].",
    mode: "agent",
    autoSend: false,
    icon: FileText,
  },
  {
    id: "register_customer",
    label: "Register a Customer",
    description: "Check duplicates and add a new workshop customer",
    prompt:
      "Register a new customer named [Full Name], mobile [050XXXXXXX], company [Optional Company], TRN [Optional TRN].",
    mode: "agent",
    autoSend: false,
    icon: UserPlus,
  },
  {
    id: "vehicle_history",
    label: "Find Vehicle History",
    description: "Look up past job cards & invoices by plate or VIN",
    prompt: "Find the complete service and invoice history for vehicle plate ",
    mode: "ask",
    autoSend: false,
    icon: Car,
  },
  {
    id: "search_customer",
    label: "Search Customer Records",
    description: "Find customer profile, vehicles & recent jobs",
    prompt: "Search customer records for ",
    mode: "ask",
    autoSend: false,
    icon: Search,
  },
  {
    id: "outstanding_payments",
    label: "Show Outstanding Payments",
    description: "Review unpaid & partially paid workshop invoices",
    prompt:
      "Show me a summary of current workshop activity and today's / this month's sales & unpaid balance.",
    mode: "ask",
    autoSend: true,
    icon: CreditCard,
  },
  {
    id: "explain_features",
    label: "Explain Software Features",
    description: "Learn how Job Cards, VAT 0%/5%, PDFs & Smart Search work",
    prompt:
      "Explain how ATIQ JEHAN Workshop ERP handles Job Cards, converting to Invoices, VAT 0% vs 5%, Discounts, and A4 PDF printing.",
    mode: "ask",
    autoSend: true,
    icon: HelpCircle,
  },
];

function createNewId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatToolLabel(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Lightweight, safe inline markdown-style renderer (no dangerouslySetInnerHTML) */
function FormattedMessageContent({ text }: { text: string }) {
  const lines = text.split("\n");

  const renderInline = (line: string) => {
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((part, idx) => {
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        return (
          <strong key={idx} className="font-semibold text-[#101D36] dark:text-white">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
        return (
          <code
            key={idx}
            className="rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[12px] font-mono text-[#0068F5] dark:text-sky-300"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      return <React.Fragment key={idx}>{part}</React.Fragment>;
    });
  };

  return (
    <div className="space-y-1.5 text-[13.5px] leading-[1.62] text-[#1A2D4D] dark:text-slate-100 whitespace-pre-wrap break-words">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1.5" />;
        if (trimmed.startsWith("### ")) {
          return (
            <h4 key={i} className="text-[13.5px] font-bold text-[#101D36] dark:text-white pt-1">
              {renderInline(trimmed.slice(4))}
            </h4>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h3 key={i} className="text-[14.5px] font-bold text-[#101D36] dark:text-white pt-1.5">
              {renderInline(trimmed.slice(3))}
            </h3>
          );
        }
        if (/^[-*•]\s+/.test(trimmed)) {
          return (
            <div key={i} className="flex items-start gap-2 pl-1">
              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#007BFF] dark:bg-sky-400 shrink-0" />
              <span className="flex-1">{renderInline(trimmed.replace(/^[-*•]\s+/, ""))}</span>
            </div>
          );
        }
        return <p key={i}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

export function AIWorkspace() {
  const { currentWorkspace } = useWorkspace();
  const { user } = usePermissions();
  const workspaceId = currentWorkspace?.id || "default";

  // Provider & Model state
  const [providers, setProviders] = useState<ProviderConnectionStatus[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>("openai");
  const [selectedModel, setSelectedModel] = useState<string>("gpt-4.1-mini");
  const [mode, setMode] = useState<AIMode>("agent");

  // Threads & Chat state
  const [threads, setThreads] = useState<AIConversationThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [executingMessageId, setExecutingMessageId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const showNotice = useCallback(
    (type: "success" | "error" | "info", text: string) => {
      setNotice({ type, text });
    },
    []
  );

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(t);
  }, [notice]);

  // Document Print Preview & PDF download state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDocRef, setPreviewDocRef] = useState<DocumentActionRef | null>(null);
  const [previewRecord, setPreviewRecord] = useState<any | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);
  const [offscreenDoc, setOffscreenDoc] = useState<{ ref: DocumentActionRef; record: any } | null>(
    null
  );

  const pdfContainerRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Load workspace-scoped session threads (no secrets stored)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`${SESSION_THREADS_PREFIX}${workspaceId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as AIConversationThread[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setThreads(parsed);
          setActiveThreadId(parsed[0].id);
          return;
        }
      }
    } catch {
      // Ignore storage errors
    }
    setThreads([]);
    setActiveThreadId(null);
  }, [workspaceId]);

  // Persist workspace-scoped session threads
  useEffect(() => {
    try {
      sessionStorage.setItem(
        `${SESSION_THREADS_PREFIX}${workspaceId}`,
        JSON.stringify(threads.slice(0, 25))
      );
    } catch {
      // Ignore quota errors
    }
  }, [threads, workspaceId]);

  const fetchProviders = useCallback(async (forceRefresh = false) => {
    setLoadingProviders(true);
    try {
      const url = forceRefresh ? "/api/ai/models?refresh=1" : "/api/ai/models";
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Unable to load AI models");
      }
      const list = (data.providers || []) as ProviderConnectionStatus[];
      setProviders(list);

      // Keep user's explicit provider selection if still present, or pick an operational one on first load
      setSelectedProvider((currentProv) => {
        const currentStatus = list.find((p) => p.provider === currentProv);
        const operational = list.find((p) => p.operational);
        const chosen =
          !forceRefresh && currentStatus && !currentStatus.operational && operational
            ? operational
            : currentStatus || list[0];

        if (chosen) {
          const validModel =
            chosen.models.find((m) => m.recommended) || chosen.models[0];
          if (validModel) {
            setSelectedModel((prevModel) =>
              chosen.models.some((m) => m.id === prevModel) ? prevModel : validModel.id
            );
          }
          return chosen.provider;
        }
        return currentProv;
      });
    } catch (err: any) {
      showNotice("error", err?.message || "Failed to check AI provider status");
    } finally {
      setLoadingProviders(false);
    }
  }, [showNotice]);

  useEffect(() => {
    fetchProviders(false);
  }, [fetchProviders]);

  const activeProviderStatus = useMemo(
    () => providers.find((p) => p.provider === selectedProvider) || null,
    [providers, selectedProvider]
  );

  const availableModels = activeProviderStatus?.models || [];
  const activeModelObj = availableModels.find((m) => m.id === selectedModel) || availableModels[0];

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) || null,
    [threads, activeThreadId]
  );

  const messages = activeThread?.messages || [];

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isStreaming]);

  // Auto-resize composer textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(180, Math.max(44, el.scrollHeight))}px`;
  }, [input]);

  const handleSelectProvider = (provider: AIProvider) => {
    setSelectedProvider(provider);
    const status = providers.find((p) => p.provider === provider);
    if (status && status.models.length > 0) {
      const rec = status.models.find((m) => m.recommended) || status.models[0];
      setSelectedModel(rec.id);
    }
  };

  const handleNewChat = () => {
    if (isStreaming) {
      abortControllerRef.current?.abort();
      setIsStreaming(false);
    }
    setActiveThreadId(null);
    setInput("");
    textareaRef.current?.focus();
  };

  const handleDeleteThread = (threadId: string) => {
    setThreads((prev) => {
      const next = prev.filter((t) => t.id !== threadId);
      if (activeThreadId === threadId) {
        setActiveThreadId(next[0]?.id || null);
      }
      return next;
    });
  };

  const updateMessageInThread = useCallback(
    (
      threadId: string,
      messageId: string,
      updater: (msg: AIChatMessageUI) => AIChatMessageUI
    ) => {
      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                updatedAt: new Date().toISOString(),
                messages: thread.messages.map((m) =>
                  m.id === messageId ? updater(m) : m
                ),
              }
            : thread
        )
      );
    },
    []
  );

  // ─── Document Print Preview & PDF Download (Reusing Official A4 Templates) ───

  const fetchDocumentRecord = async (doc: DocumentActionRef) => {
    if (doc.type === "invoice") {
      return await getInvoiceById(doc.id);
    }
    return await getJobCardById(doc.id);
  };

  const handleOpenPrintPreview = useCallback(async (doc: DocumentActionRef) => {
    setPreviewDocRef(doc);
    setPreviewRecord(null);
    setPreviewOpen(true);
    setLoadingPreview(true);
    try {
      const fullRecord = await fetchDocumentRecord(doc);
      if (!fullRecord) {
        throw new Error(`${doc.label} was not found in the active workspace.`);
      }
      setPreviewRecord(fullRecord);
    } catch (err: any) {
      showNotice("error", err?.message || "Failed to load document preview");
      setPreviewOpen(false);
    } finally {
      setLoadingPreview(false);
    }
  }, [showNotice]);

  const handleDownloadPdf = useCallback(async (doc: DocumentActionRef) => {
    setDownloadingDocId(doc.id);
    try {
      const fullRecord = await fetchDocumentRecord(doc);
      if (!fullRecord) {
        throw new Error(`${doc.label} could not be loaded for PDF generation.`);
      }
      setOffscreenDoc({ ref: doc, record: fullRecord });

      // Wait two animation frames for React to mount the official A4 print template offscreen
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );

      if (!pdfContainerRef.current) {
        throw new Error("PDF render container is not ready.");
      }

      const safeNum = (doc.number || doc.id).replace(/[^a-zA-Z0-9-_]/g, "");
      const fileName =
        doc.type === "invoice" ? `Invoice-${safeNum}.pdf` : `JobCard-${safeNum}.pdf`;

      await exportElementToPdf(pdfContainerRef.current, fileName);
      showNotice("success", `Downloaded ${fileName}`);
    } catch (err: any) {
      showNotice("error", err?.message || "Failed to generate PDF");
    } finally {
      setDownloadingDocId(null);
      setOffscreenDoc(null);
    }
  }, [showNotice]);

  // ─── Send Chat Message with SSE Streaming ───

  const sendPrompt = async (promptText: string, overrideMode?: AIMode) => {
    const cleanText = promptText.trim();
    if (!cleanText || isStreaming) return;

    const effectiveMode = overrideMode || mode;
    if (overrideMode) setMode(overrideMode);

    if (activeProviderStatus && !activeProviderStatus.configured) {
      showNotice("error", activeProviderStatus.statusMessage);
      return;
    }

    const userMsg: AIChatMessageUI = {
      id: createNewId("user"),
      role: "user",
      content: cleanText,
      createdAt: new Date().toISOString(),
      mode: effectiveMode,
    };

    const assistantMsgId = createNewId("asst");
    const assistantPlaceholder: AIChatMessageUI = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      provider: selectedProvider,
      model: selectedModel,
      mode: effectiveMode,
      toolLogs: [],
    };

    let targetThreadId = activeThreadId;
    const priorMessages = activeThread?.messages || [];

    if (!targetThreadId) {
      targetThreadId = createNewId("thread");
      const newThread: AIConversationThread = {
        id: targetThreadId,
        title: cleanText.slice(0, 56) + (cleanText.length > 56 ? "..." : ""),
        provider: selectedProvider,
        model: selectedModel,
        mode: effectiveMode,
        updatedAt: new Date().toISOString(),
        messages: [userMsg, assistantPlaceholder],
      };
      setThreads((prev) => [newThread, ...prev]);
      setActiveThreadId(targetThreadId);
    } else {
      const existingId = targetThreadId;
      setThreads((prev) =>
        prev.map((t) =>
          t.id === existingId
            ? {
                ...t,
                provider: selectedProvider,
                model: selectedModel,
                mode: effectiveMode,
                updatedAt: new Date().toISOString(),
                messages: [...t.messages, userMsg, assistantPlaceholder],
              }
            : t
        )
      );
    }

    setInput("");
    setIsStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const apiMessages = [
      ...priorMessages
        .filter((m) => m.content && !m.error)
        .slice(-16)
        .map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: cleanText },
    ];

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          provider: selectedProvider,
          model: selectedModel,
          mode: effectiveMode,
          workspaceId: currentWorkspace?.id || null,
          messages: apiMessages,
        }),
      });

      if (!res.ok || !res.body) {
        let errorMsg = `AI request failed (${res.status})`;
        try {
          const errJson = await res.json();
          if (errJson?.error) errorMsg = errJson.error;
        } catch {}
        throw new Error(errorMsg);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";

        for (const chunk of chunks) {
          const line = chunk
            .split("\n")
            .find((l) => l.startsWith("data: "));
          if (!line) continue;

          let evt: any;
          try {
            evt = JSON.parse(line.slice(6));
          } catch {
            continue;
          }

          if (evt.type === "delta" && typeof evt.text === "string") {
            updateMessageInThread(targetThreadId, assistantMsgId, (msg) => ({
              ...msg,
              content: msg.content + evt.text,
            }));
          } else if (evt.type === "tool" && evt.log) {
            const incomingLog = evt.log as ToolActivityLog;
            updateMessageInThread(targetThreadId, assistantMsgId, (msg) => {
              const logs = [...(msg.toolLogs || [])];
              const existingIdx = logs.findIndex(
                (l) => l.name === incomingLog.name && l.status === "running"
              );
              if (existingIdx >= 0 && incomingLog.status !== "running") {
                logs[existingIdx] = incomingLog;
              } else {
                logs.push(incomingLog);
              }
              return { ...msg, toolLogs: logs };
            });
          } else if (evt.type === "confirmation" && evt.payload) {
            updateMessageInThread(targetThreadId, assistantMsgId, (msg) => ({
              ...msg,
              confirmation: evt.payload as ActionConfirmationPayload,
              confirmationStatus: "pending",
            }));
          } else if (evt.type === "documents" && Array.isArray(evt.documents)) {
            updateMessageInThread(targetThreadId, assistantMsgId, (msg) => ({
              ...msg,
              documents: evt.documents as DocumentActionRef[],
            }));
          } else if (evt.type === "usage" && evt.usage) {
            updateMessageInThread(targetThreadId, assistantMsgId, (msg) => ({
              ...msg,
              usage: evt.usage,
            }));
          } else if (evt.type === "error") {
            updateMessageInThread(targetThreadId, assistantMsgId, (msg) => ({
              ...msg,
              error: evt.message || "An unexpected AI error occurred.",
            }));
          }
        }
      }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        updateMessageInThread(targetThreadId, assistantMsgId, (msg) => ({
          ...msg,
          content: msg.content || "Generation stopped by user.",
        }));
      } else {
        updateMessageInThread(targetThreadId, assistantMsgId, (msg) => ({
          ...msg,
          error: err?.message || "Failed to connect to AI service.",
        }));
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopStreaming = () => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
  };

  // ─── Execute Confirmed Workflow via /api/ai/execute ───

  const handleConfirmWorkflow = async (
    messageId: string,
    confirmedPayload: ActionConfirmationPayload
  ) => {
    if (!activeThreadId || executingMessageId) return;

    setExecutingMessageId(messageId);
    updateMessageInThread(activeThreadId, messageId, (msg) => ({
      ...msg,
      confirmation: confirmedPayload,
      confirmationStatus: "confirmed",
    }));

    try {
      const res = await fetch("/api/ai/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: currentWorkspace?.id || null,
          confirmation: confirmedPayload,
        }),
      });

      const data = (await res.json()) as ActionExecutionResult & { error?: string };

      if (!res.ok || !data.success) {
        updateMessageInThread(activeThreadId, messageId, (msg) => ({
          ...msg,
          confirmationStatus: "failed",
          executionResult: data.steps
            ? data
            : {
                success: false,
                idempotency_key: confirmedPayload.idempotency_key,
                steps: [
                  {
                    id: "exec_error",
                    label: "Workflow Execution",
                    status: "failed",
                    detail: data.error || "Execution failed.",
                  },
                ],
                created: {},
                documents: [],
                error: data.error || "Execution failed.",
              },
        }));
        showNotice("error", data.error || "Workflow execution failed");
        return;
      }

      updateMessageInThread(activeThreadId, messageId, (msg) => ({
        ...msg,
        confirmationStatus: "executed",
        executionResult: data,
      }));

      showNotice(
        "success",
        data.created.invoice_number
          ? `Invoice #${data.created.invoice_number} created successfully!`
          : data.created.job_card_number
          ? `Job Card #${data.created.job_card_number} created successfully!`
          : "Workshop workflow completed successfully!"
      );

      // Auto-open official A4 Print Preview if requested
      const autoPrintDoc = data.documents?.find((d) => d.autoPrintPreview);
      if (autoPrintDoc) {
        handleOpenPrintPreview(autoPrintDoc);
      }
    } catch (err: any) {
      updateMessageInThread(activeThreadId, messageId, (msg) => ({
        ...msg,
        confirmationStatus: "failed",
        executionResult: {
          success: false,
          idempotency_key: confirmedPayload.idempotency_key,
          steps: [],
          created: {},
          documents: [],
          error: err?.message || "Network error during workflow execution.",
        },
      }));
      showNotice("error", err?.message || "Workflow execution failed");
    } finally {
      setExecutingMessageId(null);
    }
  };

  const handleCancelWorkflow = (messageId: string) => {
    if (!activeThreadId) return;
    updateMessageInThread(activeThreadId, messageId, (msg) => ({
      ...msg,
      confirmationStatus: "cancelled",
    }));
    showNotice("info", "Proposed workshop action cancelled. No database records were created.");
  };

  const handleCopyMessage = async (msgId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(msgId);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      showNotice("error", "Could not copy text");
    }
  };

  const handleSuggestedPromptClick = (item: SuggestedPromptItem) => {
    setMode(item.mode);
    if (item.autoSend && activeProviderStatus?.configured) {
      sendPrompt(item.prompt, item.mode);
    } else {
      setInput(item.prompt);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendPrompt(input);
    }
  };

  const canWrite = ["owner", "admin", "manager", "receptionist"].includes(
    (user?.role || "").toLowerCase()
  );

  return (
    <div className="flex flex-col h-[calc(100vh-124px)] min-h-[600px] gap-3 animate-glass-in">
      {/* Top AI Command Bar */}
      <div className="glass-panel rounded-[20px] px-4 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Left: History Toggle + Title */}
        <div className="flex items-center gap-3 min-w-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setHistoryOpen((v) => !v)}
            className="h-9 w-9 p-0 rounded-xl glass-btn-secondary shrink-0 cursor-pointer"
            title={historyOpen ? "Hide Chat History" : "Show Chat History"}
          >
            {historyOpen ? (
              <PanelLeftClose className="h-4 w-4 text-[#52657F] dark:text-slate-300" />
            ) : (
              <PanelLeftOpen className="h-4 w-4 text-[#52657F] dark:text-slate-300" />
            )}
          </Button>

          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#7C3AED] via-[#2455EC] to-[#00C8F8] text-white flex items-center justify-center shrink-0 shadow-[0_4px_14px_rgba(79,70,229,0.35)]">
              <BrainCircuit className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-heading text-[15px] font-bold text-[#101D36] dark:text-white truncate">
                  Workshop AI Agent
                </h1>
                <span className="hidden sm:inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/60 text-[#4F46E5] dark:text-sky-300 border border-indigo-200/70 dark:border-indigo-700/60">
                  {currentWorkspace?.name || "Active Workspace"}
                </span>
              </div>
              <p className="text-[11px] text-[#52657F] dark:text-slate-400 truncate">
                Multi-Model ERP Assistant • OpenAI & Google Gemini
              </p>
            </div>
          </div>
        </div>

        {/* Center/Right: Provider Switcher + Model Selector + Mode Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Provider Segmented Switcher */}
          <div className="inline-flex items-center rounded-xl p-1 bg-white/75 dark:bg-[#0E1A30] border border-[#CFE0F3] dark:border-[#24385A] shadow-[var(--glass-shadow-sm)]">
            {(["openai", "gemini"] as AIProvider[]).map((prov) => {
              const status = providers.find((p) => p.provider === prov);
              const isSelected = selectedProvider === prov;
              const dotColor = loadingProviders
                ? "bg-slate-400"
                : status?.operational
                ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]"
                : status?.configured
                ? "bg-amber-500"
                : "bg-slate-400";

              return (
                <button
                  key={prov}
                  type="button"
                  onClick={() => handleSelectProvider(prov)}
                  title={status?.statusMessage || `Switch to ${prov}`}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer",
                    isSelected
                      ? "bg-gradient-to-r from-[#2455EC] to-[#007BFF] text-white shadow-xs"
                      : "text-[#52657F] dark:text-slate-300 hover:text-[#101D36] dark:hover:text-white"
                  )}
                >
                  <span className={cn("h-2 w-2 rounded-full shrink-0", dotColor)} />
                  <span>{prov === "openai" ? "OpenAI" : "Gemini"}</span>
                </button>
              );
            })}
          </div>

          {/* Model Selector Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center h-9 rounded-xl px-3 text-xs font-semibold glass-btn-secondary text-[#101D36] dark:text-slate-100 gap-1.5 cursor-pointer max-w-[200px] outline-none">
              <Sparkles className="h-3.5 w-3.5 text-[#6338F5] dark:text-sky-400 shrink-0" />
              <span className="truncate">
                {activeModelObj?.label || selectedModel}
              </span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60 shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 glass-menu p-1.5">
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-[#52657F] dark:text-slate-400 flex items-center justify-between">
                <span>
                  {selectedProvider === "openai" ? "OpenAI Models" : "Google Gemini Models"}
                </span>
                <span
                  className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                    activeProviderStatus?.operational
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300"
                  )}
                >
                  {activeProviderStatus?.operational ? "Connected" : "Key Needed"}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {availableModels.map((m) => (
                <DropdownMenuItem
                  key={m.id}
                  onClick={() => setSelectedModel(m.id)}
                  className={cn(
                    "flex flex-col items-start gap-0.5 rounded-lg p-2 cursor-pointer",
                    selectedModel === m.id && "bg-blue-50/90 dark:bg-blue-950/60"
                  )}
                >
                  <div className="flex items-center justify-between w-full gap-2">
                    <span className="text-xs font-bold text-[#101D36] dark:text-slate-100">
                      {m.label}
                    </span>
                    <div className="flex items-center gap-1">
                      {m.recommended && (
                        <span className="text-[9.5px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/70 text-[#4F46E5] dark:text-sky-300">
                          Recommended
                        </span>
                      )}
                      {selectedModel === m.id && (
                        <Check className="h-3.5 w-3.5 text-[#007BFF]" />
                      )}
                    </div>
                  </div>
                  <span className="text-[11px] text-[#52657F] dark:text-slate-400">
                    {m.description}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Ask AI vs Agent Mode Toggle */}
          <div className="inline-flex items-center rounded-xl p-1 bg-white/75 dark:bg-[#0E1A30] border border-[#CFE0F3] dark:border-[#24385A] shadow-[var(--glass-shadow-sm)]">
            <button
              type="button"
              onClick={() => setMode("ask")}
              title="Read-only mode: answer questions and search workshop records safely"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer",
                mode === "ask"
                  ? "bg-[#101D36] dark:bg-sky-500 text-white shadow-xs"
                  : "text-[#52657F] dark:text-slate-300 hover:text-[#101D36] dark:hover:text-white"
              )}
            >
              <Shield className="h-3 w-3" />
              <span>Ask AI</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("agent")}
              title="Action-capable mode: prepares Customers, Vehicles, Job Cards & Invoices with confirmation preview"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer",
                mode === "agent"
                  ? "bg-gradient-to-r from-[#7C3AED] to-[#007BFF] text-white shadow-xs"
                  : "text-[#52657F] dark:text-slate-300 hover:text-[#101D36] dark:hover:text-white"
              )}
            >
              <Zap className="h-3 w-3" />
              <span>Agent Mode</span>
            </button>
          </div>

          {/* Refresh Provider Status */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={loadingProviders}
            onClick={() => fetchProviders(true)}
            className="h-9 w-9 p-0 rounded-xl glass-btn-secondary cursor-pointer"
            title="Refresh live AI provider connection status"
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5 text-[#52657F] dark:text-slate-300",
                loadingProviders && "animate-spin"
              )}
            />
          </Button>
        </div>
      </div>

      {/* Main Split Workspace: Chat History Rail + Conversation Stage */}
      <div className="flex-1 min-h-0 flex gap-3 overflow-hidden">
        {/* Left Chat History Rail */}
        {historyOpen && (
          <aside className="hidden md:flex w-[248px] shrink-0 flex-col glass-panel rounded-[20px] overflow-hidden">
            <div className="p-3 border-b border-[#D7E4F3]/80 dark:border-[#24385A]">
              <Button
                type="button"
                onClick={handleNewChat}
                className="w-full h-9 rounded-xl ai-generate-btn text-white text-xs font-semibold justify-center gap-2 cursor-pointer"
              >
                <MessageSquarePlus className="h-3.5 w-3.5 relative z-10" />
                <span className="relative z-10">New Chat</span>
              </Button>
            </div>

            <div className="px-3 pt-2.5 pb-1 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-[#647B97] dark:text-slate-400">
              <History className="h-3 w-3" />
              <span>Workspace Sessions</span>
            </div>

            <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
              {threads.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-[#647B97] dark:text-slate-400">
                  No chats in this session yet. Start a conversation or pick a prompt.
                </div>
              ) : (
                threads.map((thread) => {
                  const isActive = thread.id === activeThreadId;
                  return (
                    <div
                      key={thread.id}
                      className={cn(
                        "group flex items-center justify-between gap-1 rounded-xl px-2.5 py-2 text-xs transition-all cursor-pointer",
                        isActive
                          ? "bg-[#E6F1FF] dark:bg-blue-950/60 text-[#0068F5] dark:text-sky-300 font-semibold border border-[#BDD9FF] dark:border-blue-800/70"
                          : "text-[#1E3256] dark:text-slate-300 hover:bg-white/70 dark:hover:bg-white/[0.05]"
                      )}
                      onClick={() => setActiveThreadId(thread.id)}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate leading-snug">{thread.title}</p>
                        <p className="text-[10px] text-[#647B97] dark:text-slate-400 mt-0.5 uppercase">
                          {thread.provider} • {thread.mode}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteThread(thread.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-slate-400 hover:text-red-600 transition-opacity cursor-pointer"
                        title="Delete chat"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-3 border-t border-[#D7E4F3]/80 dark:border-[#24385A] bg-white/40 dark:bg-white/[0.02] text-[11px] text-[#52657F] dark:text-slate-400 space-y-1">
              <div className="flex items-center justify-between">
                <span>Role Permissions</span>
                <span className="font-bold capitalize text-[#101D36] dark:text-slate-200">
                  {user?.role || "Staff"}
                </span>
              </div>
              <p className="text-[10.5px] leading-snug">
                {canWrite
                  ? "Agent writes require your explicit confirmation before saving."
                  : "Read-only role: Ask AI queries enabled; record creation restricted."}
              </p>
            </div>
          </aside>
        )}

        {/* Right Conversation Canvas */}
        <section className="flex-1 min-w-0 flex flex-col glass-panel rounded-[20px] overflow-hidden">
          {/* Provider API Key Setup Notice (honest & transparent when env var is missing) */}
          {!loadingProviders && activeProviderStatus && !activeProviderStatus.configured && (
            <div className="mx-4 mt-3 rounded-xl border border-amber-300/90 dark:border-amber-700/60 bg-amber-50/90 dark:bg-amber-950/40 px-4 py-3 flex flex-wrap items-start justify-between gap-3 shrink-0">
              <div className="flex items-start gap-2.5 text-xs text-amber-950 dark:text-amber-200">
                <KeyRound className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-bold">
                    {activeProviderStatus.label} API Key Not Configured Yet
                  </p>
                  <p className="leading-relaxed">
                    Add{" "}
                    <code className="rounded bg-amber-100 dark:bg-amber-900/60 px-1.5 py-0.5 font-mono text-[11px]">
                      {selectedProvider === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY"}
                    </code>{" "}
                    to <code className="font-mono text-[11px]">.env.local</code> (or Vercel
                    Environment Variables) and restart the server. Keys remain 100% server-side and
                    are never exposed to the browser.
                  </p>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fetchProviders(true)}
                className="h-7 rounded-lg text-xs border-amber-400 bg-white/80 dark:bg-slate-900 cursor-pointer"
              >
                <RefreshCw className="h-3 w-3 mr-1" /> Re-check
              </Button>
            </div>
          )}

          {/* Scrollable Messages Area */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-5">
            {messages.length === 0 ? (
              /* Empty / Welcome State */
              <div className="max-w-3xl mx-auto py-4 sm:py-8 space-y-6">
                <div className="text-center space-y-3">
                  <div className="mx-auto h-14 w-14 rounded-2xl ai-generate-btn flex items-center justify-center text-white shadow-lg">
                    <Sparkles className="h-7 w-7 relative z-10 ai-sparkle-icon" />
                  </div>
                  <div className="space-y-1.5">
                    <h2 className="font-heading text-xl sm:text-2xl font-extrabold text-[#101D36] dark:text-white tracking-tight">
                      ATIQ JEHAN Workshop AI Assistant & Agent
                    </h2>
                    <p className="text-xs sm:text-[13.5px] text-[#52657F] dark:text-slate-300 max-w-xl mx-auto leading-relaxed">
                      Ask questions in <strong>English, Urdu, Roman Urdu, or Arabic</strong>, search
                      customers & vehicle histories, or switch to <strong>Agent Mode</strong> to
                      create Customers, Vehicles, Job Cards, and VAT Invoices with safe financial
                      confirmation and direct A4 Print / PDF download.
                    </p>
                  </div>

                  {/* Safety & Capability Pills */}
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold bg-white/80 dark:bg-[#14223B] border border-[#CFE0F3] dark:border-[#273E63] text-[#1A2D4D] dark:text-slate-200">
                      <Shield className="h-3 w-3 text-emerald-600" />
                      Workspace RLS Enforced
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold bg-white/80 dark:bg-[#14223B] border border-[#CFE0F3] dark:border-[#273E63] text-[#1A2D4D] dark:text-slate-200">
                      <Wrench className="h-3 w-3 text-[#007BFF]" />
                      Controlled ERP Tools
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold bg-white/80 dark:bg-[#14223B] border border-[#CFE0F3] dark:border-[#273E63] text-[#1A2D4D] dark:text-slate-200">
                      <Printer className="h-3 w-3 text-[#6338F5]" />
                      Official A4 Print & PDF
                    </span>
                  </div>
                </div>

                {/* 7 Safe Suggested Prompt Chips */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {SUGGESTED_PROMPTS.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSuggestedPromptClick(item)}
                        className="group text-left rounded-2xl p-3.5 bg-white/78 dark:bg-[#14223B]/80 border border-[#D7E4F3] dark:border-[#253B60] hover:border-[#007BFF] dark:hover:border-sky-400 hover:bg-white dark:hover:bg-[#182A4A] shadow-[var(--glass-shadow-sm)] hover:shadow-[var(--glass-shadow-md)] transition-all cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="h-7 w-7 rounded-xl bg-gradient-to-br from-[#6338F5]/12 to-[#007BFF]/15 text-[#2455EC] dark:text-sky-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <span
                            className={cn(
                              "text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
                              item.mode === "agent"
                                ? "bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300"
                                : "bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300"
                            )}
                          >
                            {item.mode === "agent" ? "Agent" : "Ask AI"}
                          </span>
                        </div>
                        <p className="text-[13px] font-bold text-[#101D36] dark:text-slate-100 group-hover:text-[#0068F5] dark:group-hover:text-sky-300 transition-colors">
                          {item.label}
                        </p>
                        <p className="text-[11.5px] text-[#52657F] dark:text-slate-400 mt-0.5 leading-snug">
                          {item.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Active Conversation Feed */
              <div className="max-w-4xl mx-auto space-y-5">
                {messages.map((msg, idx) => {
                  const isUser = msg.role === "user";
                  const isLastAssistant = !isUser && idx === messages.length - 1;
                  const previousUserMsg =
                    !isUser && idx > 0 && messages[idx - 1].role === "user"
                      ? messages[idx - 1]
                      : null;

                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex gap-3",
                        isUser ? "justify-end" : "justify-start"
                      )}
                    >
                      {!isUser && (
                        <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-[#7C3AED] via-[#2455EC] to-[#00C8F8] text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                          <Bot className="h-4 w-4" />
                        </div>
                      )}

                      <div
                        className={cn(
                          "min-w-0 max-w-[92%] sm:max-w-[85%]",
                          isUser ? "items-end" : "flex-1"
                        )}
                      >
                        {isUser ? (
                          <div className="rounded-2xl rounded-tr-sm px-4 py-3 bg-gradient-to-br from-[#1746D1] via-[#007BFF] to-[#0095E8] text-white shadow-[0_6px_18px_rgba(0,104,245,0.24)] text-[13.5px] leading-relaxed whitespace-pre-wrap break-words">
                            {msg.content}
                          </div>
                        ) : (
                          <div className="rounded-2xl rounded-tl-sm px-4 py-3.5 bg-white/88 dark:bg-[#14223B]/90 border border-[#D7E4F3] dark:border-[#24385A] shadow-[var(--glass-shadow-sm)]">
                            {/* Assistant Metadata Header */}
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-1.5 border-b border-[#EBF2FB] dark:border-[#203354]">
                              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#52657F] dark:text-slate-400">
                                <span className="uppercase font-bold text-[#4F46E5] dark:text-sky-400">
                                  {msg.provider === "gemini" ? "Google Gemini" : "OpenAI"}
                                </span>
                                <span>•</span>
                                <span className="font-mono text-[10.5px]">{msg.model}</span>
                                <span>•</span>
                                <span className="capitalize">{msg.mode || "ask"} mode</span>
                              </div>

                              {msg.usage && (msg.usage.total_tokens || 0) > 0 && (
                                <span className="text-[10.5px] text-[#647B97] dark:text-slate-400 tabular-nums">
                                  {msg.usage.total_tokens} tokens
                                </span>
                              )}
                            </div>

                            {/* Live Tool Execution Activity Chips */}
                            {msg.toolLogs && msg.toolLogs.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mb-2.5">
                                {msg.toolLogs.map((log, i) => (
                                  <span
                                    key={`${log.name}-${i}`}
                                    className={cn(
                                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium border",
                                      log.status === "running"
                                        ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-sky-300 dark:border-blue-800"
                                        : log.status === "error"
                                        ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800"
                                        : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800"
                                    )}
                                  >
                                    {log.status === "running" ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : log.status === "error" ? (
                                      <AlertTriangle className="h-3 w-3" />
                                    ) : (
                                      <Check className="h-3 w-3" />
                                    )}
                                    <span>{formatToolLabel(log.name)}</span>
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Main Assistant Text or Streaming Indicator */}
                            {msg.content ? (
                              <FormattedMessageContent text={msg.content} />
                            ) : isLastAssistant && isStreaming && !msg.error ? (
                              <div className="flex items-center gap-2 text-xs text-[#52657F] dark:text-slate-300 py-1">
                                <Loader2 className="h-4 w-4 animate-spin text-[#007BFF]" />
                                <span>Analyzing workshop context & generating response...</span>
                              </div>
                            ) : null}

                            {/* Error Banner */}
                            {msg.error && (
                              <div className="mt-2 rounded-xl border border-red-200 dark:border-red-800/70 bg-red-50/90 dark:bg-red-950/40 px-3 py-2.5 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                <span>{msg.error}</span>
                              </div>
                            )}

                            {/* Direct Document Links from Read-Only Tools */}
                            {msg.documents && msg.documents.length > 0 && (
                              <div className="mt-3 pt-2.5 border-t border-[#E6EFFA] dark:border-[#203354] flex flex-wrap gap-2">
                                {msg.documents.map((doc) => {
                                  const href =
                                    doc.type === "invoice"
                                      ? `/invoices/${doc.id}`
                                      : `/job-cards/${doc.id}`;
                                  return (
                                    <div
                                      key={`${doc.type}-${doc.id}`}
                                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#CFE0F3] dark:border-[#284068] bg-[#F4F9FF] dark:bg-[#0E1A30] px-2.5 py-1.5 text-xs"
                                    >
                                      <FileText className="h-3.5 w-3.5 text-[#007BFF]" />
                                      <span className="font-semibold text-[#101D36] dark:text-slate-100">
                                        {doc.label}
                                      </span>
                                      <Link
                                        href={href}
                                        className="ml-1 inline-flex items-center gap-1 text-[#0068F5] dark:text-sky-400 hover:underline font-semibold"
                                      >
                                        <ExternalLink className="h-3 w-3" /> Open
                                      </Link>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenPrintPreview(doc)}
                                        className="ml-1 inline-flex items-center gap-1 text-[#4F46E5] dark:text-indigo-300 hover:underline font-semibold cursor-pointer"
                                      >
                                        <Printer className="h-3 w-3" /> Print
                                      </button>
                                      <button
                                        type="button"
                                        disabled={downloadingDocId === doc.id}
                                        onClick={() => handleDownloadPdf(doc)}
                                        className="ml-1 inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 hover:underline font-semibold cursor-pointer"
                                      >
                                        {downloadingDocId === doc.id ? (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                          <Download className="h-3 w-3" />
                                        )}
                                        PDF
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Financial Confirmation Preview Card */}
                            {msg.confirmation && (
                              <ActionConfirmationCard
                                payload={msg.confirmation}
                                status={msg.confirmationStatus || "pending"}
                                executing={executingMessageId === msg.id}
                                onConfirm={(updated) => handleConfirmWorkflow(msg.id, updated)}
                                onCancel={() => handleCancelWorkflow(msg.id)}
                              />
                            )}

                            {/* Real-Time Workflow Execution Timeline & Document Actions */}
                            {(executingMessageId === msg.id || msg.executionResult) && (
                              <ExecutionTimeline
                                result={msg.executionResult}
                                executing={executingMessageId === msg.id}
                                downloadingDocId={downloadingDocId}
                                onPrintPreview={handleOpenPrintPreview}
                                onDownloadPdf={handleDownloadPdf}
                              />
                            )}

                            {/* Copy & Safe Retry Controls */}
                            {!isStreaming && (msg.content || msg.error) && (
                              <div className="mt-2.5 pt-2 border-t border-[#EDF3FB] dark:border-[#1E3152] flex items-center gap-2">
                                {msg.content && (
                                  <button
                                    type="button"
                                    onClick={() => handleCopyMessage(msg.id, msg.content)}
                                    className="inline-flex items-center gap-1 text-[11px] font-medium text-[#647B97] hover:text-[#007BFF] dark:text-slate-400 dark:hover:text-sky-300 cursor-pointer"
                                  >
                                    {copiedId === msg.id ? (
                                      <>
                                        <Check className="h-3 w-3 text-emerald-600" />
                                        Copied
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="h-3 w-3" />
                                        Copy
                                      </>
                                    )}
                                  </button>
                                )}

                                {previousUserMsg && !msg.executionResult?.success && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      sendPrompt(previousUserMsg.content, previousUserMsg.mode)
                                    }
                                    className="inline-flex items-center gap-1 text-[11px] font-medium text-[#647B97] hover:text-[#007BFF] dark:text-slate-400 dark:hover:text-sky-300 cursor-pointer"
                                  >
                                    <RotateCcw className="h-3 w-3" />
                                    Retry
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Bottom Composer Area */}
          <div className="p-3 sm:p-4 border-t border-[#D7E4F3]/85 dark:border-[#24385A] bg-white/55 dark:bg-[#0E1A30]/80 shrink-0">
            <div className="max-w-4xl mx-auto space-y-2">
              <div className="relative rounded-2xl bg-white/95 dark:bg-[#13223C] border border-[#C6DAF2] dark:border-[#2C456F] shadow-[var(--glass-shadow-inset)] focus-within:border-[#007BFF] focus-within:ring-2 focus-within:ring-[#007BFF]/20 transition-all p-2">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    mode === "agent"
                      ? "Instruct Workshop AI Agent in English, Urdu, Roman Urdu, or Arabic (e.g., Create customer, job card & invoice)..."
                      : "Ask anything about your workshop, customers, vehicles, invoices, or ERP features..."
                  }
                  className="w-full resize-none bg-transparent px-2.5 py-2 text-[13.5px] text-[#101D36] dark:text-slate-100 placeholder:text-[#7A91AD] dark:placeholder:text-slate-400 focus:outline-none max-h-[180px]"
                />

                <div className="flex items-center justify-between gap-2 pt-1.5 px-1.5 border-t border-[#EDF3FB] dark:border-[#1E3152]">
                  <div className="flex items-center gap-2 text-[11px] text-[#647B97] dark:text-slate-400 min-w-0">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold shrink-0",
                        mode === "agent"
                          ? "bg-indigo-50 text-[#4F46E5] dark:bg-indigo-950/70 dark:text-sky-300"
                          : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      )}
                    >
                      {mode === "agent" ? (
                        <>
                          <Zap className="h-3 w-3" /> Agent Mode
                        </>
                      ) : (
                        <>
                          <Shield className="h-3 w-3" /> Ask AI (Read-Only)
                        </>
                      )}
                    </span>
                    <span className="hidden sm:inline truncate">
                      Enter to send • Shift+Enter for new line
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isStreaming ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleStopStreaming}
                        className="h-8 px-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer"
                      >
                        <Square className="h-3 w-3 mr-1.5 fill-current" />
                        Stop
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        disabled={!input.trim()}
                        onClick={() => sendPrompt(input)}
                        className="h-8 px-3.5 rounded-xl ai-generate-btn text-white text-xs font-semibold cursor-pointer disabled:opacity-45"
                      >
                        <Send className="h-3.5 w-3.5 mr-1.5 relative z-10" />
                        <span className="relative z-10">Send</span>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Floating Status Toast */}
      {notice && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm animate-glass-in no-print">
          <div
            className={cn(
              "rounded-2xl border px-4 py-3 text-xs font-semibold shadow-lg backdrop-blur-xl flex items-center gap-2.5",
              notice.type === "success"
                ? "bg-emerald-50/95 border-emerald-300 text-emerald-900 dark:bg-emerald-950/90 dark:border-emerald-700 dark:text-emerald-200"
                : notice.type === "error"
                ? "bg-red-50/95 border-red-300 text-red-900 dark:bg-red-950/90 dark:border-red-700 dark:text-red-200"
                : "bg-blue-50/95 border-blue-300 text-blue-900 dark:bg-blue-950/90 dark:border-blue-700 dark:text-blue-200"
            )}
          >
            {notice.type === "success" ? (
              <Check className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            <span>{notice.text}</span>
          </div>
        </div>
      )}

      {/* Official A4 Print Preview Modal & Offscreen PDF Capture Container */}
      <AIDocumentPreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        docRef={previewDocRef}
        record={previewRecord}
        loading={loadingPreview}
        downloading={Boolean(previewDocRef && downloadingDocId === previewDocRef.id)}
        onDownloadPdf={() => {
          if (previewDocRef) handleDownloadPdf(previewDocRef);
        }}
        pdfContainerRef={pdfContainerRef}
        offscreenDoc={offscreenDoc}
      />
    </div>
  );
}
