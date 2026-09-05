import { Metadata } from "next";
import { ReportsView } from "@/components/reports/reports-view";

export const metadata: Metadata = {
  title: "Financial & Accounting Reports | Atiq Jehan Auto Repair",
  description: "Daily Transaction Report and Balance Summary accounting statements.",
};

export default function ReportsPage() {
  return <ReportsView />;
}
