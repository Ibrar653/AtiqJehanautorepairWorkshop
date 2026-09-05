import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { CreditCard } from "lucide-react";

export default function PaymentsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="Record and review cash, bank, and credit payments"
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Payments" },
        ]}
      />
      <Card>
        <CardContent className="py-16 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-3">
            <CreditCard className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold text-foreground">Payment Records</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            Payment transactions and partial payment records placeholder.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
