import { Header } from "@/components/header";

export default function CaseStudyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-dm-bg">
      <Header userName="Austin" />
      <main className="max-w-3xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
