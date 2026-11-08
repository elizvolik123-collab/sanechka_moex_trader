export default function AuthLayout({ children }: LayoutProps<"/">) {
  return <div className="mx-auto flex w-full max-w-md flex-col justify-center py-6 md:py-12">{children}</div>;
}
