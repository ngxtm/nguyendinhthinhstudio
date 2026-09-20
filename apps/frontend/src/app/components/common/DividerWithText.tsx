interface DividerWithTextProps {
  text?: string
  className?: string
  textClassName?: string
  lineClassName?: string
}

export default function DividerWithText({ text, className, textClassName, lineClassName }: Readonly<DividerWithTextProps>) {
  return (
    <div className={`relative flex items-center ${className}`}>
      <div className={`flex-grow border-t ${lineClassName}`}></div>
      {text && <span className={`mx-2.5 bg-white dark:bg-neutral-950 ${textClassName}`}>{text}</span>}
      <div className={`flex-grow border-t ${lineClassName}`}></div>
    </div>
  )
}
