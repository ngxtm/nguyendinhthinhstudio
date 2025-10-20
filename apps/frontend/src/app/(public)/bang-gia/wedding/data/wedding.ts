export const serviceCategories = [
    {
        id: 'id-01',
        title: 'Tìm hiểu 01 bộ hình chuẩn NDT Studio',
        description:
            '01 Layout trong các gói đã bao gồm full ekip thực hiện: Photo, Retouch, Makeup, Fashion Stylist, Head of Fashion Stylist (đối với gói Premium/VIP), Lighting, Studio, Setup (Có thể phụ thu có báo trước). Cũng như bao gồm tất cả về mặt tạo hình: Styling, Trang Phục, Tóc, Makeup, Nails (đối với gói Premium/VIP), tạo dáng.',
        isActive: true
    },
    {
        id: 'id-02',
        title: 'Tìm hiểu Layout',
        description:
            'Layout Makeup & Hair tức là một kiểu trang điểm và làm tóc. Layout Styling tức là một kiểu phối hợp trang phục, phụ kiện. Layout Shooting tức là một kiểu phối hợp ánh sáng, góc chụp, tạo dáng, màu sắc.',
        isActive: true
    },
    {
        id: 'id-03',
        title: 'Tìm hiểu Phụ Thu',
        description:
            'Tuy nhiên, với những vật dụng chụp ảnh (props) sử dụng một lần (hoa tươi, bánh kem tươi,…) hoặc các props không có sẵn, thiết kế công phu, mới hoàn toàn và trang phục thiết kế riêng chúng tôi sẽ phụ thu có báo trước.',
        isActive: true
    },
    {
        id: 'id-04',
        title: 'Tìm hiểu Custom Layout',
        description:
            'Các Layout có thể Custom (tùy chỉnh) theo yêu cầu của khách hàng. Tuy nhiên, nếu là Collection của NDT Studio chúng tôi khuyến nghị khách hàng chọn Original, vì chúng tôi đã tính toán rất kỹ để sản xuất và thương mại.',
        isActive: true
    },
    {
        id: 'id-05',
        title: 'Tìm hiểu Chỉnh Sửa Layout để phù hợp',
        description:
            'Gói chụp cá nhân của NDT Studio được thiết kế để phục vụ tốt nhất cho cá nhân. Gói chụp được thiết kế để phục vụ tốt nhất cho cá nhân.',
        isActive: true
    }
]

export const pricingPackages = [
    {
        id: 'id-01',
        title: 'GÓI CAO CẤP',
        type: 'PREMIUM',
        services: [
            {
                id: 'id-01-01',
                content: 'Dịch vụ phòng chờ riêng cao cấp',
                isActive: true
            },
            {
                id: 'id-01-02',
                content: 'Ekip Master thực hiện',
                isActive: true
            },
            {
                id: 'id-01-03',
                content: 'Thiết bị và công nghệ hình ảnh hiện đại nhất',
                isActive: true
            },
            {
                id: 'id-01-04',
                content: 'Quyền tư vấn trực tiếp về concept và câu chuyện',
                isActive: true
            },
            {
                id: 'id-01-05',
                content: 'Quyền yêu cầu làm mới layout, concept - có phụ thu',
                isActive: true
            },
            {
                id: 'id-01-06',
                content: 'Miễn phí các Set Design tầm trung',
                isActive: true
            },
            {
                id: 'id-01-07',
                content: 'Cá nhân hóa hình ảnh, làm việc 1-1 với các Master',
                isActive: true
            }
        ],
        angleLable: 'BEST',
        subContent: 'Gói Premium đề cao sự tỉ mỉ, chỉnh chu và cá nhân hóa các bộ ảnh. Premium của thương hiệu NDT Studio luôn là sự khác biệt và sự đẳng cấp về mọi mặt.',
        subCard: [
            {
                title: 'PREMIUM MINI',
                price: 7500,
                services: [
                    {
                        id: 'id-01-pre1-01',
                        content: '02 Layout Cưới',
                    },
                    {
                        id: 'id-01-pre1-02',
                        content: '02 Váy, 02 Vest',
                    },
                    {
                        id: 'id-01-pre1-03',
                        content: '1 Bộ phụ kiện',
                    },
                    {
                        id: 'id-01-pre1-04',
                        content: '20 ảnh chỉnh sửa'
                    },
                    {
                        id: 'id-01-pre1-05',
                        content: 'Makeup & HairStylist'
                    },
                    {
                        id: 'id-01-pre1-06',
                        content: 'Stylist Cao Cấp tạo hình'
                    },
                    {
                        id: 'id-01-pre1-07',
                        content: 'Retouch cá nhân hóa'
                    },
                    {
                        id: 'id-01-pre1-08',
                        content: '1 ảnh cổng (60x90 - Khung: 3D-CF)'
                    },
                    {
                        id: 'id-01-pre1-09',
                        content: '5 ảnh (13x18 - trơn)'
                    },
                    {
                        id: 'id-01-pre1-10',
                        content: 'Slide'
                    }
                ],
                subContent: 'Gói chụp một bộ hình'
            },
            {
                title: 'PREMIUM BASIC',
                price: 8900,
                angleLable: 'BEST-SELLER',
                services: [
                    {
                        id: 'id-01-pre2-01',
                        content: '02 Layout Cưới',
                    },
                    {
                        id: 'id-01-pre2-02',
                        content: '02 Váy, 02 Vest',
                    },
                    {
                        id: 'id-01-pre2-03',
                        content: '1 Bộ phụ kiện',
                    },
                    {
                        id: 'id-01-pre2-04',
                        content: '20 ảnh chỉnh sửa'
                    },
                    {
                        id: 'id-01-pre2-05',
                        content: 'Makeup & HairStylist'
                    },
                    {
                        id: 'id-01-pre2-06',
                        content: 'Stylist Cao Cấp tạo hình'
                    },
                    {
                        id: 'id-01-pre2-07',
                        content: 'Retouch cá nhân hóa'
                    },
                    {
                        id: 'id-01-pre2-08',
                        content: '2 ảnh cổng (60x90 - Khung: 3D-CF)'
                    },
                    {
                        id: 'id-01-pre2-09',
                        content: '5 ảnh (13x18 - có khung)'
                    },
                    {
                        id: 'id-01-pre2-10',
                        content: '1 Album Photobook'
                    },
                    {   
                        id: 'id-01-pre2-11',
                        content: 'Slide'
                    }
                ],
                subContent: 'Lựa chọn tiết kiệm cho trải nghiệm tốt nhất'
            },
            {
                title: 'PREMIUM SIGNATURE',
                price: 12000,
                angleLable: 'BEST-SELLER',
                services: [
                    {
                        id: 'id-01-pre3-01',
                        content: '01 Layout Cưới, 01 Layout Thời Trang',
                    },
                    {
                        id: 'id-01-pre3-02',
                        content: '1 Bộ phụ kiện',
                    },
                    {
                        id: 'id-01-pre3-04',
                        content: '20 ảnh chỉnh sửa'
                    },
                    {
                        id: 'id-01-pre3-05',
                        content: 'Makeup & HairStylist'
                    },
                    {
                        id: 'id-01-pre3-06',
                        content: 'Stylist Cao Cấp tạo hình'
                    },
                    {
                        id: 'id-01-pre3-07',
                        content: 'Retouch cá nhân hóa'
                    },
                    {
                        id: 'id-01-pre3-08',
                        content: '2 ảnh cổng (60x90 - Cao cấp)'
                    },
                    {
                        id: 'id-01-pre3-09',
                        content: '5 ảnh (13x18 - có khung)'
                    },
                    {
                        id: 'id-01-pre3-10',
                        content: '1 Album Photobook'
                    },
                    {
                        id: 'id-01-pre3-11',
                        content: 'Slide, USB'
                    }
                ],
                subContent: 'Tinh thần và xu hướng thời trang vào cưới'
            },
            {
                title: 'OUTDOOR-INDOOR',
                price: 13900,
                services: [
                    {
                        id: 'id-01-pre4-01',
                        content: '02 Layout Ngoại Cảnh, 01 Layout Studio Cơ Bản',
                    },
                    {
                        id: 'id-01-pre4-02',
                        content: '1 Bộ phụ kiện',
                    },
                    {
                        id: 'id-01-pre4-04',
                        content: '20 ảnh chỉnh sửa'
                    },
                    {
                        id: 'id-01-pre4-05',
                        content: 'Makeup & HairStylist'
                    },
                    {
                        id: 'id-01-pre4-06',
                        content: 'Stylist Cao Cấp tạo hình'
                    },
                    {
                        id: 'id-01-pre4-07',
                        content: 'Retouch cá nhân hóa'
                    },
                    {
                        id: 'id-01-pre4-08',
                        content: '2 ảnh cổng (60x90 - Cao cấp)'
                    },
                    {
                        id: 'id-01-pre4-09',
                        content: '5 ảnh (13x18 - có khung)'
                    },
                    {
                        id: 'id-01-pre4-10',
                        content: '1 Album Photobook'
                    },
                    {
                        id: 'id-01-pre4-11',
                        content: 'Slide, USB'
                    }
                ],
                subContent: 'Kết hợp ngoại cảnh tự nhiên và studio chuyên nghiệp'
            }
        ]
    },
    {
        id: 'id-02',
        title: 'GÓI TIÊU CHUẨN',
        type: 'STANDARD',
        angleLable: 'SAVE',
        services: [
            {
                id: 'id-02-01',
                content: 'Dịch vụ Studio tiêu chuẩn',
                isActive: true
            },
            {
                id: 'id-02-02',
                content: 'Ekip tiêu chuẩn thực hiện',
                isActive: true
            },
            {
                id: 'id-02-03',
                content: 'Thiết bị và công nghệ mới, tiên tiến',
                isActive: true
            },
            {
                id: 'id-02-04',
                content: 'Tư vấn Online về concept và câu chuyện',
                isActive: true
            },
            {
                id: 'id-02-05',
                content: 'Layout "Ready To Sell"',
                isActive: true
            },
            {
                id: 'id-02-06',
                content: 'Miễn phí phông trơn, setup đơn giản',
                isActive: false
            }
        ],
        subContent: 'Gói Standard hướng đến giá tiền tốt nhất cho trải nghiệm và chất lượng hình ảnh tốt nhất. Với độ hoàn hảo không quá khắt khe, Standard mang những Layout trend nhất từ thương hiệu Nguyễn Đình Thịnh Studio mang đến gần hơn với mọi người',
        subCard: [
            {
                title: 'STANDARD MINI',
                price: 3500,
                services: [
                    {
                        id: 'id-02-sta-01',
                        content: '01 Layout Cưới',
                    },
                    {
                        id: 'id-02-sta-02',
                        content: '01 Váy, 01 Vest',
                    },
                    {
                        id: 'id-02-sta-03',
                        content: '1 Bộ phụ kiện',
                    },
                    {
                        id: 'id-02-sta-04',
                        content: '6 ảnh chỉnh sửa'
                    },
                    {
                        id: 'id-02-sta-05',
                        content: 'Makeup & HairStylist'
                    },
                    {
                        id: 'id-02-sta-06',
                        content: 'Stylist Cao Cấp tạo hình'
                    },
                    {
                        id: 'id-02-sta-07',
                        content: 'Retouch cá nhân hóa'
                    },
                    {
                        id: 'id-02-sta-08',
                        content: '1 ảnh cổng (60x90 - trơn)'
                    },
                    {
                        id: 'id-02-sta-09',
                        content: '5 ảnh (13x18 - trơn)'
                    }
                ],
                subContent: 'Lựa chọn tiết kiệm cho trải nghiệm tốt nhất'
            },
            {
                title: 'STANDARD BASIC',
                price: 4500,
                angleLable: 'BEST-SELLER',
                services: [
                    {
                        id: 'id-02-stan2-01',
                        content: '02 Layout Cưới',
                    },
                    {
                        id: 'id-02-stan2-02',
                        content: '02 Váy, 02 Vest',
                    },
                    {
                        id: 'id-02-stan2-03',
                        content: '1 Bộ phụ kiện',
                    },
                    {
                        id: 'id-02-stan2-04',
                        content: '7 ảnh chỉnh sửa'
                    },
                    {
                        id: 'id-02-stan2-05',
                        content: 'Makeup & HairStylist'
                    },
                    {
                        id: 'id-02-stan2-06',
                        content: 'Stylist Cao Cấp tạo hình'
                    },
                    {
                        id: 'id-02-stan2-07',
                        content: 'Retouch cá nhân hóa'
                    },
                    {
                        id: 'id-02-stan2-08',
                        content: '2 ảnh cổng (60x90 - Khung: 3D-CF)'
                    },
                    {
                        id: 'id-02-stan2-09',
                        content: '5 ảnh (13x18 - trơn)'
                    }
                ],
                subContent: 'Tinh thần và xu hướng thời trang vào cưới'
            },
            {
                title: 'STANDARD SIGNATURE',
                price: 6800,
                angleLable: 'BEST-SELLER',
                services: [
                    {
                        id: 'id-02-stan3-01',
                        content: '01 Layout Cưới',
                    },
                    {
                        id: 'id-02-stan3-02',
                        content: '01 Váy, 01 Vest',
                    },
                    {
                        id: 'id-02-stan3-03',
                        content: '1 Bộ phụ kiện',
                    },
                    {
                        id: 'id-02-stan3-04',
                        content: '1 Setup Concept',
                    },
                    {
                        id: 'id-02-stan3-05',
                        content: '15 ảnh chỉnh sửa'
                    },
                    {
                        id: 'id-02-stan3-06',
                        content: 'Makeup & HairStylist'
                    },
                    {
                        id: 'id-02-stan3-07',
                        content: 'Stylist Cao Cấp tạo hình'
                    },
                    {
                        id: 'id-02-stan3-08',
                        content: 'Retouch cá nhân hóa'
                    },
                    {
                        id: 'id-02-stan3-09',
                        content: '1 ảnh cổng (60x90 - Cao cấp)'
                    },
                    {
                        id: 'id-02-stan3-10',
                        content: '5 ảnh (13x18 - có khung)'
                    }
                ],
                subContent: 'Lựa chọn tốt nhất & hàng đầu'
            }
        ]
    }
]

export const additionalServiceAndTerms = [
    {
        id: 'at-01',
        title: 'Dịch Vụ Kèm Thêm',
        services: [
            {
                id: 'at-01-01',
                title: 'Sửa Thêm Ảnh Premium',
                description: 'Sửa lẻ: 150k/01 ảnh \n Combo: 1200k/10 ảnh (Best Choice - Lựa chọn tốt nhất)',
                isActive: true
            },
            {
                id: 'at-01-02',
                title: 'Sửa Thêm Ảnh Standard',
                description: 'Sửa lẻ: 50k/01 ảnh \n Combo: 400k/10 ảnh (Best Choice - Lựa chọn tốt nhất)',
                isActive: true
            },
            {
                id: 'at-01-03',
                title: 'Video',
                description: 'Quay Video Hậu Trường (BST) bằng thiết bị chuyên dụng: \n • Quay Video Hậu Trường (BTS): 2500k/01 Video \n • Quay Video Hậu Trường (BTS) VIP: 5000k/01 Video \n • Quay Video Beauty: 5000k/01 Video \n • Quay Video Beauty VIP: 8000k/01 Video \n • Combo Video Beauty + Hậu Trường: 7000k/02 Video \n Quay Video Hậu Trường (BST) bằng điện thoại: FREE - Áp dụng từ gói Premium trở lên',
                isActive: true
            },
            {
                id: 'at-01-04',
                title: 'Outdoor (Ngoại cảnh)',
                description: 'Liên hệ để được tư vấn chi tiết tại: XEM THÊM',
                isActive: true
            }
        ]
    },
    {
        id: 'at-02',
        title: 'ĐIỀU KHOẢN',
        services: [
            {
                id: 'at-02-01',
                title: 'PHỤ THU',
                description: 'Đối với các trang phục, phụ kiện, bối cảnh đặc biệt, hoành tráng vượt quá gói hoặc có tính chất đặc thù, sử dụng một lần (hoa tươi, bánh kem,…). Studio sẽ có phụ thu (có tư vấn trước).',
                isActive: true
            },
            {
                id: 'at-02-02',
                title: 'CHỌN ẢNH',
                description: 'Khách hàng được chuyên viên hướng dẫn chọn ảnh ngay sau buổi chụp & trao đổi, đóng góp ý kiến xây dựng bộ ảnh đẹp nhất theo sở thích. Studio KHÔNG KHUYẾN KHÍCH việc tự chọn ảnh vì sẽ ảnh hưởng đến trải nghiệm dịch vụ (Áp dụng từ gói Premium trở lên)',
                isActive: true
            },
            {
                id: 'at-02-03',
                title: 'SỬA ẢNH',
                description: 'Khách hàng sẽ làm việc trực tiếp với Retoucher (chuyên gia sửa ảnh) để tự do chỉnh sửa, chọn màu sắc và cân đối tỉ lệ mặt theo ý thích. Khách hàng có thể lấy ý kiến từ chuyên gia để đảm bảo sở thích và nghệ thuật.',
                isActive: true
            },
            {
                id: 'at-02-04',
                title: 'ẢNH THÔ',
                description: 'Khách hàng có thể yêu cầu Studio giao hình gốc (chuẩn JPEG - có thời hạn trên link), nhưng Studio không khuyến khích vì đây là những bức ảnh thô. Studio có quyền từ chối giao ảnh gốc trong một số trường hợp',
                isActive: true
            },
            {
                id: 'at-02-05',
                title: 'THANH TOÁN & ĐẶT CỌC',
                description: 'Khách hàng đặt cọc 50% – 80% tổng phí trước buổi chụp. Và thanh toán 100% ngay sau khi hoàn thành buổi chụp (vui lòng nhận biên lai hoặc giữ ảnh màn hình chuyển khoản). Riêng đối với gói VIP. Khách hàng phải cọc 50% phí trước khi tư vấn (hoàn lại nếu quá trình tư vấn không phù hợp).',
                isActive: true
            },
            {
                id: 'at-02-06',
                title: 'ĐÚNG LỊCH HẸN',
                description: 'Khách hàng vui lòng đến đúng giờ đã đặt lịch. Trường hợp trễ giờ sẽ ảnh hưởng đến trải nghiệm dịch vụ và Studio sẽ có cộng thêm phí hoặc hủy lịch nếu ảnh hưởng đến những khách hàng khác. \n Thời gian trễ sau 15 phút thì có thể phải dời lịch hoặc có tính phụ thu 2tr/show.',
                isActive: true
            },
            {
                id: 'at-02-07',
                title: 'DỜI LỊCH/ HUỶ LỊCH',
                description: 'Trong trường hợp cần dời lịch/ huỷ lịch, khách hàng phải báo trước 07 ngày và có lý do thỏa đáng. Studio chỉ có thể hỗ trợ tối đa dời 01 lần. \n *Trường hợp dời lịch trong thời gian 07 ngày trước buổi chụp sẽ mất cọc.',
                isActive: true
            },
            {
                id: 'at-02-08',
                title: 'CHÍNH SÁCH HOÀN/ HOÃN LỊCH',
                description: 'Trong trường hợp bất khả kháng quý khách phải dời lịch hoặc huỷ lịch trong thời gian 7 ngày trước ngày chụp thì có thể chọn thêm gói hoàn/hoãn lịch và có thể trao đổi với tư vấn viên để check một lịch mới phù hợp hơn. \n Gói hoàn/ hoãn lịch trị giá 3tr5/gói/show (có hiệu lực 1 lần). \n Cụ thể khi chọn gói này quý khách được dời lịch 1 lần hoặc huỷ lịch 1 lần trong trường hợp khẩn cấp. Quý khách có thể chọn mua trước hoặc sau khi đặt lịch tuỳ vào nhu cầu cá nhân của mình. \n Studio hiểu được rằng cả quý khách hàng và ekip đều không ai muốn các sự kiện bất ngờ xảy đến làm gián đoạn lịch chụp. Để tránh gây tổn thất lớn với toàn bộ ekip và ảnh hưởng gián tiếp đến lợi ích các khách hàng khác, Studio phát hành gói này để đảm bảo khắc phục cũng như duy trì những lợi ích kế tiếp của khách hàng. \n*Ngoài ra nếu sự cố xuất phát từ Studio, Studio sẽ có những chính sách ưu đãi riêng đặc biệt để bù đắp quý khách hàng. \n Trân trọng cảm ơn quý khách đã tin yêu và lựa chọn ekip Nguyễn Đình Thịnh Studio <3',
                isActive: true
            },
            {
                id: 'at-02-09',
                title: 'PHẢN HỒI & Ý KIẾN',
                description: 'Sau khi nhận được bộ ảnh, layout ảnh, khách hàng có quyền đóng góp ý kiến, phản hồi để hoàn thành bộ ảnh cuối cùng (Final)',
                isActive: true
            },
            {
                id: 'at-02-10',
                title: 'THỜI GIAN CHỤP ẢNH',
                description: 'Thời gian chụp không giới hạn, số lượng ảnh cũng không giới hạn và cam kết đủ số lượng ảnh chỉnh sửa trong gói.',
                isActive: true
            },
            {
                id: 'at-02-11',
                title: 'THỜI GIAN HOÀN THÀNH',
                description: 'Tùy theo số lượng Layout, và số lượng ảnh, chuyên viên sẽ thông báo thời gian hoàn thành tác phẩm. Với quy trình hiện tại, bộ ảnh sẽ được hoàn thành từ 10-15 ngày tuỳ theo số lượng hình. Nếu quý khách có nhu cầu chỉnh gấp, phí chỉnh gấp 500k/5 ảnh (gói Standard/Premium). Dịch vụ này phụ thuộc vào lịch trình của team Retouch, tư vấn viên sẽ thông báo với quý khách nếu có lịch.',
                isActive: true
            }
        ]
    }
]