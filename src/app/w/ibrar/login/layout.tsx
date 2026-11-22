export default function WorkspaceLoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-[#EAF1FA] dark:bg-[#0B1324] py-10 px-4">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -top-32 -left-32 h-[420px] w-[420px] rounded-full opacity-80 dark:opacity-35"
        style={{
          background: "linear-gradient(135deg, #007BFF 0%, #009FE8 55%, #B0E0E6 100%)",
          filter: "blur(2px)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -bottom-36 -right-28 h-[460px] w-[460px] rounded-full opacity-75 dark:opacity-30"
        style={{
          background: "linear-gradient(315deg, #1746D1 0%, #0095FF 50%, #B0E0E6 100%)",
          filter: "blur(2px)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed top-[14%] right-[12%] h-24 w-24 rounded-full bg-[#F5F9FF]/80 dark:bg-[#16233C]/60 border border-white/80 dark:border-white/10 shadow-[8px_8px_20px_rgba(130,156,190,0.22),-6px_-6px_16px_rgba(255,255,255,0.9)] hidden md:block"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed bottom-[16%] left-[10%] h-16 w-16 rounded-full bg-[#F5F9FF]/80 dark:bg-[#16233C]/60 border border-white/80 dark:border-white/10 shadow-[6px_6px_16px_rgba(130,156,190,0.20),-5px_-5px_12px_rgba(255,255,255,0.9)] hidden md:block"
      />

      <div className="relative z-10 w-full max-w-[440px]">
        {children}
      </div>
    </div>
  );
}
