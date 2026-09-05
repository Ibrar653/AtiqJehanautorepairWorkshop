import JobCardDetailView from "@/components/job-cards/job-card-detail-view";

interface JobCardPageProps {
  params: Promise<{ id: string }>;
}

export default async function JobCardDetailPage({ params }: JobCardPageProps) {
  const { id } = await params;
  return <JobCardDetailView id={id} />;
}

