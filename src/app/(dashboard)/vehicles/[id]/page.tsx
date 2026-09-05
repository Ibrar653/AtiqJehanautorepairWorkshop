import { VehicleDetailView } from "@/components/vehicles/vehicle-detail-view";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function VehicleDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <VehicleDetailView id={id} />;
}
