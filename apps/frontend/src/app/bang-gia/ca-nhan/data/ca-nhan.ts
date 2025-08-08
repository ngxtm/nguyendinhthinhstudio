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
      'Chúng tôi sửa một số yếu tố nhỏ: Ánh sáng, màu da, màu sắc để đảm bảo phù hợp nhất với khách hàng. Ngoài ra, khách hàng cũng có thể yêu cầu cân chỉnh gương mặt, cân chỉnh làn da theo ý thích (sẽ có sự tư vấn từ Retouch)',
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
        content: 'BEST SELLER, BEST CHOICE',
        isActive: true
      },
      {
        id: 'id-01-02',
        content: 'Dịch vụ phòng chờ riêng, phòng chụp ưu tiên',
        isActive: true
      },
      {
        id: 'id-01-03',
        content: 'Photo, Retouch, Lighting, Studio, Setup',
        isActive: true
      },
      {
        id: 'id-01-04',
        content: 'Makeup, Hair, Outfit, Nails, Poser',
        isActive: true
      },
      {
        id: 'id-01-05',
        content: 'Layout Premium/ Standard có sẵn',
        isActive: true
      },
      {
        id: 'id-01-06',
        content: 'Cá Nhân Hóa Layout (có thể có phụ thu)',
        isActive: true
      }
    ],
    angleLable: 'BEST',
    subContent: 'Gói Premium đề cao sự tỉ mỉ, chỉnh chu và cá nhân hóa các bộ ảnh. Premium của thương hiệu NDT Studio luôn là sự khác biệt và sự đẳng cấp về mọi mặt.',
    subCard: [
      {
        title: 'PREMIUM I',
        price: 3500,
        services: [
          {
            id: 'id-01-pre1-01',
            content: '01 Layout Premium',
          },
          {
            id: 'id-01-pre1-02',
            content: '01 Layout Styling từ Head of Fashion Stylist',
          },
          {
            id: 'id-01-pre1-03',
            content: '01 Layout Makeup & Hairstyle',
          },
          {
            id: 'id-01-pre1-04',
            content: '03 giờ chuẩn bị và shooting',
          },
          {
            id: 'id-01-pre1-05',
            content: '05 ảnh chỉnh sửa'
          }
        ],
        subContent: 'Gói chụp một bộ hình'
      },
      {
        title: 'PREMIUM II',
        price: 6500,
        services: [
          {
            id: 'id-01-pre1-01',
            content: '02 Layout Premium',
          },
          {
            id: 'id-01-pre1-02',
            content: '02 Layout Styling từ Head of Fashion Stylist',
          },
          {
            id: 'id-01-pre1-03',
            content: '02 Layout Makeup & Hairstyle',
          },
          {
            id: 'id-01-pre1-04',
            content: '05 giờ chuẩn bị và shooting',
          },
          {
            id: 'id-01-pre1-05',
            content: '10 ảnh chỉnh sửa'
          }
        ],
        subContent: 'Gói chụp hai bộ hình, tiết kiệm 2500k'
      },
      {
        title: 'PREMIUM III',
        price: 9500,
        services: [
          {
            id: 'id-01-pre1-01',
            content: '03 Layout Premium',
          },
          {
            id: 'id-01-pre1-02',
            content: '03 Layout Styling từ Head of Fashion Stylist',
          },
          {
            id: 'id-01-pre1-03',
            content: '03 Layout Makeup & Hairstyle',
          },
          {
            id: 'id-01-pre1-04',
            content: '07 giờ chuẩn bị và shooting',
          },
          {
            id: 'id-01-pre1-05',
            content: '15 ảnh chỉnh sửa'
          }
        ],
        subContent: 'Gói chụp ba bộ hình, tiết kiệm 5000k'
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
        content: 'Mức giá TIẾT KIỆM NHẤT',
        isActive: true
      },
      {
        id: 'id-02-02',
        content: 'Photo, Retouch, Lighting, Studio, Setup',
        isActive: true
      },
      {
        id: 'id-02-03',
        content: 'Makeup, Hair, Outfit, Poser',
        isActive: true
      },
      {
        id: 'id-02-04',
        content: 'Layout Standard có sẵn',
        isActive: true
      },
      {
        id: 'id-02-05',
        content: 'Cá Nhân Hóa Layout (có thể có phụ thu)',
        isActive: true
      },
      {
        id: 'id-02-06',
        content: 'Phòng chờ riêng, phòng chụp ưu tiên',
        isActive: false
      },
      {
        id: 'id-02-07',
        content: 'Các Layout có độ phức tạp cao',
        isActive: false
      }
    ],
    subContent: 'Gói Standard hướng đến giá tiền tốt nhất cho trải nghiệm và chất lượng hình ảnh tốt nhất. Với độ hoàn hảo không quá khắt khe, Standard mang những Layout trend nhất từ thương hiệu Nguyễn Đình Thịnh Studio mang đến gần hơn với mọi người',
    subCard: [
      {
        id: 'id-02-stan1',
        title: 'STANDARD I',
        price: 1500,
        services: [
          {
            id: 'id-stan1-01',
            content: '01 Layout Standard',
          },
          {
            id: 'id-stant1-02',
            content: '01 Layout Makeup & Hairstyle',
          },
          {
            id: 'id-stant1-03',
            content: '03 giờ chuẩn bị và shooting',
          },
          {
            id: 'id-stan1-04',
            content: '05 ảnh chỉnh sửa'
          }
        ],
        subContent: 'Gói chụp một bộ hình'
      },
      {
        id: 'id-02-stan2',
        title: 'STANDARD II',
        price: 2500,
        services: [
          {
            id: 'id-stan2-01',
            content: '02 Layout Standard',
          },
          {
            id: 'id-stan2-02',
            content: '02 Layout Makeup & Hairstyle',
          },
          {
            id: 'id-stan2-03',
            content: '05 giờ chuẩn bị và shooting',
          },
          {
            id: 'id-stan2-04',
            content: '10 ảnh chỉnh sửa'
          }
        ],
        subContent: 'Gói chụp hai bộ hình, tiết kiệm 500k'
      },
      {
        id: 'id-02-stan3',
        title: 'STANDARD III',
        price: 3500,
        services: [
          {
            id: 'id-stan3-01',
            content: '03 Layout Standard',
          },
          {
            id: 'id-stan3-02',
            content: '03 Layout Makeup & Hairstyle',
          },
          {
            id: 'id-stan3-03',
            content: '07 giờ chuẩn bị và shooting',
          },
          {
            id: 'id-stan3-04',
            content: '15 ảnh chỉnh sửa'
          }
        ],
        subContent: 'Gói chụp ba bộ hình, tiết kiệm 1000k'
      }
    ]
  },
  {
    id: 'id-03',
    title: 'GÓI V.I.P',
    type: 'VIP',
    angleLable: 'PRIVATE',
    services: [
      {
        id: 'id-03-01',
        content: 'Chỉnh chu, hoàn hảo, trải nghiệm tốt nhất',
        isActive: true
      },
      {
        id: 'id-03-02',
        content: 'Dịch vụ phòng chụp, makeup Private (riêng tư)',
        isActive: true
      },
      {
        id: 'id-03-03',
        content: 'Dịch vụ ăn uống miễn phí theo sở thích',
        isActive: true
      },
      {
        id: 'id-03-04',
        content: 'NDT Studio tư vấn sáng tạo, chuyên sâu và trực tiếp thực hiện',
        isActive: true
      },
      {
        id: 'id-03-05',
        content: 'NDT Studio quy định Ekip thực hiện',
        isActive: true
      },
      {
        id: 'id-03-06',
        content: 'Thiết bị & Công nghệ hình ảnh cao cấp nhất',
        isActive: true
      }
    ],
    subContent: 'Gói VIP là gói dịch vụ cao cấp nhất của Nguyễn Đình Thịnh Studio. Là gói duy nhất có thể yêu cầu cả Creative Director thực hiện bộ ảnh để đảm bảo sự hoàn hảo, chỉnh chu.',
    subCard: [
      {
        id: 'id-03-vip2',
        title: 'VIP II',
        price: 15000,
        services: [
          {
            id: 'id-vip2-01',
            content: '02 Layout Chụp Ảnh Blocking',
          },
          {
            id: 'id-vip2-02',
            content: '02 Layout Styling từ Head of Fashion Stylist',
          },
          {
            id: 'id-vip2-03',
            content: '02 Layout Makeup & Hairstyle',
          },
          {
            id: 'id-vip2-04',
            content: '06 giờ chuẩn bị và shooting',
          },
          {
            id: 'id-vip2-05',
            content: '15 ảnh chỉnh sửa chất lượng siêu cao'
          }
        ],
        subContent: 'Gói chụp hai bộ hình'
      },
      {
        id: 'id-03-vip3',
        title: 'VIP III',
        price: 25000,
        services: [
          {
            id: 'id-vip3-01',
            content: '03 Layout Chụp Ảnh Blocking',
          },
          {
            id: 'id-vip3-02',
            content: '03 Layout Styling từ Head of Fashion Stylist',
          },
          {
            id: 'id-vip3-03',
            content: '03 Layout Makeup & Hairstyle',
          },
          {
            id: 'id-vip3-04',
            content: '08 giờ chuẩn bị và shooting',
          },
          {
            id: 'id-vip3-05',
            content: '25 ảnh chỉnh sửa chất lượng siêu cao'
          }
        ],
        subContent: 'Gói chụp ba bộ hình'
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
        description: 'Sửa lẻ: 100k/01 ảnh \n Combo: 800k/10 ảnh (Best Choice - Lựa chọn tốt nhất)',
        isActive: true
      },
      {
        id: 'at-01-02',
        title: 'Sửa Thêm Ảnh Standard',
        description: 'Sửa lẻ: 35k/01 ảnh \n Combo: 300k/10 ảnh (Best Choice - Lựa chọn tốt nhất)',
        isActive: true
      },
      {
        id: 'at-01-03',
        title: 'Sửa Thêm Ảnh VIP',
        description: 'Sửa lẻ: 500k/01 ảnh \n Combo: 2000k/5 ảnh (Best Choice - Lựa chọn tốt nhất)',
        isActive: true
      },
      {
        id: 'at-01-04',
        title: 'Video',
        description: 'Quay Video Hậu Trường (BST) bằng thiết bị chuyên dụng: \n • Quay Video Hậu Trường (BTS): 2500k/01 Video \n • Quay Video Hậu Trường (BTS) VIP: 5000k/01 Video \n • Quay Video Beauty: 5000k/01 Video \n • Quay Video Beauty VIP: 8000k/01 Video \n • Combo Video Beauty + Hậu Trường: 7000k/02 Video \n Quay Video Hậu Trường (BST) bằng điện thoại: FREE - Áp dụng từ gói Premium trở lên',
        isActive: true
      },
      {
        id: 'at-01-05',
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

export default pricingPackages
