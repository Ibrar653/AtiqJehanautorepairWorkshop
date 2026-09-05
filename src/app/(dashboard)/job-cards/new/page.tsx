import { Suspense } from "react";
import JobCardForm from "@/components/job-cards/job-card-form";
import { Loader2 } from "lucide-react";

export default function NewJobCardPage() {
  return (
    <Suspense
      fallback={
        <div className="py-20 text-center text-muted-foreground">
          <Loader2 className="h-8 w-8 mx-auto animate-spin mb-3 text-primary" />
          <p>Loading job card editor...</p>
        </div>
      }
    >
      <JobCardForm />
    </Suspense>
  );
}
