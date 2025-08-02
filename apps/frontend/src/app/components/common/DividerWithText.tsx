interface DividerWithTextProps {
  text: string
  className?: string
  textClassName?: string
  lineClassName?: string
}

export default function DividerWithText({ text, className, textClassName, lineClassName }: Readonly<DividerWithTextProps>) {
  return (
    <div className={`relative flex items-center px-6 md:px-28 ${className}`}>
      <div className={`flex-grow border-t ${lineClassName}`}></div>
      <span className={`mx-4 bg-white px-2 ${textClassName}`}>{text}</span>
      <div className={`flex-grow border-t ${lineClassName}`}></div>
    </div>
  )
}
