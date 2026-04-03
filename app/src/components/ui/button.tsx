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
  const baseStyles = 'font-medium rounded-lg transition-colors inline-flex items-center justify-center'
  
  const variantStyles = {
    default: 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400',
    outline: 'border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:bg-gray-50',
    ghost: 'text-gray-700 hover:bg-gray-100 disabled:text-gray-400',
    destructive: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-400'
  }

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg'
  }

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    />
  )
}
