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
      'Các Layout có thể Custom (tùy chỉnh) theo yêu cầu của khách hàng. Tuy nhiên, nếu là Collection của TVB chúng tôi khuyến nghị khách hàng chọn Original, vì chúng tôi đã tính toán rất kỹ để sản xuất và thương mại.',
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

export const additionalServices = [
  {
    id: 'id-01',
    title: 'Sửa Thêm Ảnh Premium/ Standard',
    description: 'Sửa lẻ: 250k/01 ảnh <br/> Combo: 1000k/05 ảnh (Lựa chọn tốt nhất)',
  },
  {
    id: 'id-02',
    title: 'Sửa Thêm Ảnh VIP',
    description: 'Sửa lẻ: 500k/01 ảnh <br/> Combo: 2000k/05 ảnh (Lựa chọn tốt nhất)'
  },
  {
    id: 'id-03',
    title: 'Video',
    description: 'Quay Video Hậu Trường (BTS): 2500k/01 Video <br/> Quay Video Hậu Trường (BTS) VIP: 5000k/01 Video <br/> Quay Video Beauty: 5000k/01 Video <br/> Quay Video Beauty VIP: 8000k/01 Video <br/> Combo Video Beauty + Hậu Trường: 7000k/02 Video <br/> Tham khảo Video >>',
  },
  {
    id: 'id-04',
    title: 'Outdoor (Ngoại cảnh)',
    description: 'Phụ thu: +5000k/ Buổi (Đã bao gồm chi phí Lighting ngoài trời)'
  },
  {
    id: 'id-05',
    title: 'Thiết Kế Poster - Banner',
    description: 'Thiết kế cơ bản: 250k/ảnh <br/> Thiết kế nâng cao: 500k/ảnh <br/> Thiết kế siêu nâng cao: 1000k/ảnh'
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
    subContent: 'Gói Premium đề cao sự tỉ mỉ, chỉnh chu và cá nhân hóa các bộ ảnh. Premium của thương hiệu TVB luôn là sự khác biệt và sự đẳng cấp về mọi mặt.',
    subCard: [
      {
        title: 'PREMIUM I',
        price: 9500,
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
            content: '04 giờ chuẩn bị và shooting',
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
        price: 16500,
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
            content: '06 giờ chuẩn bị và shooting',
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
        price: 23500,
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
            content: '08 giờ chuẩn bị và shooting',
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
        price: 5500,
        services: [
          {
            id: 'id-stan1-01',
            content: '01 Layout Standard',
          },
          {
            id: 'id-stan1-02',
            content: '01 Layout Styling từ Head of Fashion Stylist',
          },
          {
            id: 'id-stant1-03',
            content: '01 Layout Makeup & Hairstyle',
          },
          {
            id: 'id-stant1-04',
            content: '04 giờ chuẩn bị và shooting',
          },
          {
            id: 'id-stan1-05',
            content: '05 ảnh chỉnh sửa'
          }
        ],
        subContent: 'Gói chụp một bộ hình'
      },
      {
        id: 'id-02-stan2',
        title: 'STANDARD II',
        price: 9500,
        services: [
          {
            id: 'id-stan2-01',
            content: '02 Layout Standard',
          },
          {
            id: 'id-stan2-02',
            content: '02 Layout Styling từ Head of Fashion Stylist',
          },
          {
            id: 'id-stan2-03',
            content: '02 Layout Makeup & Hairstyle',
          },
          {
            id: 'id-stan2-04',
            content: '06 giờ chuẩn bị và shooting',
          },
          {
            id: 'id-stan2-05',
            content: '10 ảnh chỉnh sửa'
          }
        ],
        subContent: 'Gói chụp hai bộ hình, tiết kiệm 1500k'
      },
      {
        id: 'id-02-stan3',
        title: 'STANDARD III',
        price: 13500,
        services: [
          {
            id: 'id-stan3-01',
            content: '03 Layout Standard',
          },
          {
            id: 'id-stan3-02',
            content: '03 Layout Styling từ Head of Fashion Stylist',
          },
          {
            id: 'id-stan3-03',
            content: '03 Layout Makeup & Hairstyle',
          },
          {
            id: 'id-stan3-04',
            content: '08 giờ chuẩn bị và shooting',
          },
          {
            id: 'id-stan3-05',
            content: '15 ảnh chỉnh sửa'
          }
        ],
        subContent: 'Gói chụp ba bộ hình, tiết kiệm 3000k'
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
        price: 35000,
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
            content: '15 ảnh chỉnh sửa'
          }
        ],
        subContent: 'Gói chụp hai bộ hình'
      },
      {
        id: 'id-03-vip3',
        title: 'VIP III',
        price: 50000,
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
            content: '25 ảnh chỉnh sửa'
          }
        ],
        subContent: 'Gói chụp ba bộ hình'
      }
    ]
  }
]

export default pricingPackages
