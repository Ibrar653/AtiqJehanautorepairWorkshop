import { Suspense } from "react";
import { InvoicesView } from "@/components/invoices/invoices-view";
import { Loader2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default function InvoicesPage() {

  return (
    <Suspense
      fallback={
        <div className="py-24 text-center text-muted-foreground">
          <Loader2 className="h-8 w-8 mx-auto animate-spin mb-3 text-blue-600" />
          <p className="font-medium text-sm">Loading tax invoices...</p>
        </div>
      }
    >
      <InvoicesView />
    </Suspense>
  );
}
