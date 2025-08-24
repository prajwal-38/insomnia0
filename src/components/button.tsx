import { cn } from "@/lib/utils";
import React from "react";

export const Button: React.FC<{
  children?: React.ReactNode;
  className?: string;
  variant?: "simple" | "outline" | "primary";
  as?: React.ElementType;
  [x: string]: any;
}> = ({
  children,
  className,
  variant = "primary",
  as: Tag = "button",
  ...props
}) => {
  const variantClass =
    variant === "simple"
      ? "bg-background relative z-10 bg-transparent hover:bg-accent  border border-transparent text-foreground text-sm md:text-sm transition font-medium duration-200  rounded-full px-4 py-2  flex items-center justify-center dark:text-foreground dark:hover:bg-accent dark:hover:shadow-xl"
      : variant === "outline"
        ? "bg-background relative z-10 hover:bg-primary hover:shadow-xl  text-foreground border border-border hover:text-primary-foreground text-sm md:text-sm transition font-medium duration-200  rounded-full px-4 py-2  flex items-center justify-center"
        : variant === "primary"
          ? "bg-primary relative z-10 hover:bg-primary/90  border border-transparent text-primary-foreground text-sm md:text-sm transition font-medium duration-200  rounded-full px-4 py-2  flex items-center justify-center shadow-[0px_-1px_0px_0px_rgba(147,51,234,0.4)_inset,_0px_1px_0px_0px_rgba(147,51,234,0.4)_inset]"
          : "";
  return (
    <Tag
      className={cn(
        "relative z-10 flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition duration-200 hover:bg-primary/90 md:text-sm",
        variantClass,
        className,
      )}
      {...props}
    >
      {children ?? `Get Started`}
    </Tag>
  );
};
