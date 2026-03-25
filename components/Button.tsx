import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'fab';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  isLoading, 
  className = '', 
  disabled,
  ...props 
}) => {
  // M3 Base: 40px height, rounded-full, font-medium tracking-wide
  const baseStyles = "h-10 px-6 rounded-full font-medium text-sm tracking-wide transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]";
  
  const variants = {
    // Primary: 
    // Light Mode: Black bg, White text 
    // Dark Mode: White bg, Black text
    primary: "bg-black text-white hover:bg-neutral-800 shadow-sm dark:bg-white dark:text-black dark:hover:bg-neutral-200",
    
    // Secondary: 
    // Light Mode: Grey-100 bg, Black text
    // Dark Mode: Grey-800 bg, White text
    secondary: "bg-neutral-100 text-black border border-neutral-200 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-white dark:border-neutral-700 dark:hover:bg-neutral-700",
    
    // Ghost: 
    // Adaptive text color
    ghost: "bg-transparent text-neutral-600 hover:bg-neutral-100 hover:text-black dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-white",
    
    // FAB: 
    // Inverted high contrast
    fab: "h-14 w-14 !p-0 rounded-[16px] shadow-md bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
  };

  const finalClassName = variant === 'fab' 
    ? `${baseStyles.replace('h-10 px-6 rounded-full', '')} ${variants.fab} ${className}` 
    : `${baseStyles} ${variants[variant]} ${className}`;

  return (
    <button 
      className={finalClassName}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <>
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Processing
        </>
      ) : children}
    </button>
  );
};