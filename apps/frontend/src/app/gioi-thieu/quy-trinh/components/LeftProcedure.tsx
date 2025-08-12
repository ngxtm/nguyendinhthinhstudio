interface LeftProcedureProps {
    title: string
    description: string
    image: string
}

export default function LeftProcedure({ title, description, image }: LeftProcedureProps) {
    return (
        <div>
            <p>NGUYỄN ĐÌNH THỊNH STUDIO</p>
            <h1>QUY TRÌNH DỊCH VỤ</h1>
        </div>
    )
}