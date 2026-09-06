import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
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
        <CardContent className="py-8">
          <EmptyState
            icon={CreditCard}
            title="Payment Records"
            description="Payment transactions and partial payment records placeholder."
          />
        </CardContent>
      </Card>
    </div>
  );
}
