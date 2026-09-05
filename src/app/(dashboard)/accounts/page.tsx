import { Metadata } from "next";
import { AccountsView } from "@/components/accounts/accounts-view";

export const metadata: Metadata = {
  title: "Accounts & Ledger | Atiq Jehan Auto Repair",
  description: "Professional accounting ledger, Chart of Accounts, worker payables, bank accounts, and journal transactions.",
};

export default function AccountsPage() {
  return <AccountsView />;
}
