import { Metadata } from "next";
import { ExpensesView } from "@/components/expenses/expenses-view";

export const metadata: Metadata = {
  title: "Expenses | Atiq Jehan Auto Repair",
  description: "Track workshop operational expenses, vendor disbursements, and profit margins.",
};

export default function ExpensesPage() {
  return <ExpensesView />;
}
