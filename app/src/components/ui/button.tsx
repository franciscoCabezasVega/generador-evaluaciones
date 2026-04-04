import React from "react"

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
}

export function Button({
  className = '',
  variant = 'default',
  size = 'md',
  ...props
}: ButtonProps) {
  const baseStyles = 'font-medium rounded-lg transition-all inline-flex items-center justify-center cursor-pointer select-none'
  
  const variantStyles = {
    default: 'bg-amber-500 text-slate-900 hover:bg-amber-400 active:bg-amber-600 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed shadow-sm shadow-amber-900/20',
    outline: 'border border-slate-600 text-slate-300 hover:bg-slate-800 hover:border-slate-500 hover:text-slate-100 active:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed',
    ghost: 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 active:bg-slate-700 disabled:text-slate-600 disabled:cursor-not-allowed',
    destructive: 'bg-red-600 text-white hover:bg-red-500 active:bg-red-700 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed shadow-sm shadow-red-900/20'
  }

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-sm gap-1.5',
    md: 'px-4 py-2 text-sm gap-2',
    lg: 'px-6 py-3 text-base gap-2'
  }

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    />
  )
}
