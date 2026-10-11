import { Builder } from "./Builder";

// The program builder (plan phase 4, board 17).
export default async function ProgramBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Builder id={id} />;
}
