import React from "react";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          {/* ADHDone logo and name (was a generic icon in a black square). */}
          <div className="flex flex-col items-center mb-6">
            <img
              src="https://media.base44.com/images/public/68dd79726fce6eca73056b9b/052e0f4d2_ADHD1.png"
              alt="ADHDone logo"
              className="w-20 h-20 rounded-2xl object-contain"
            />
            <span className="mt-2 text-xl font-bold text-foreground">ADHDone</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="text-muted-foreground mt-2">{subtitle}</p>}
        </div>
        <div className="bg-card rounded-2xl shadow-sm border border-border p-8">
          {children}
        </div>
        {footer && (
          <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>
        )}
      </div>
    </div>
  );
}