const cheerio = require('cheerio');

// HTML sample từ user
const htmlSample = `
<div class="w-100 h-auto shadow rounded-3 bg-white p-2 mb-3">
    <div class="w-100 h-auto p-0 m-0 pt-2">    
        <div class="stt"><div class="stt_txt">1</div></div>	
        <div class="listings_center">
            <h2 class="p-1 fs-5 h2 m-0 pt-0 ps-0 text-capitalize"><a href="https://trangvangvietnam.com/listings/1187856672/mison-trans-cong-ty-tnhh-van-tai-mien-son.html">Mison Trans - Công Ty TNHH Vận Tải Miên Sơn</a></h2>
            
            <div class="p-1 ps-0 star_mb"> 
                <img title="5 - Diamond Sponsor" src="https://trangvangvietnam.com/images/5_diamond.png">  <img class="ps-3" src="https://trangvangvietnam.com/images/ICON-SPONSOR.png"> <span class="star_text">NHÀ TÀI TRỢ</span>
            </div>
            
        </div>
           
        <div class="pe-2 listings_right"> 
            <div class="w-100 h-auto p-2 pb-1 pt-0 daxacthuc_pc"><img class="w-100" src="https://trangvangvietnam.com/images/logo_daxacthuc.png"></div>
            <div class="w-100 h-auto p-0 pt-1 daxacthuc_m"><img class="w-100" src="https://trangvangvietnam.com/images/logo_daxacthuc.png"></div>
            <div class="w-100 by_trangvang">BY YELLOW PAGES</div>
        </div>
        
        <p class="m-0 clearfix"></p>
    </div>
                     
     <div class="w-100 h-auto p-0 m-0">
         <div class="cach_truoc"></div>    
        <div class="h-auto pt-0 div_logo_diachi">
            <div class="border border-dark-subtle rounded-2 mt-1 p-2 mb-3 text-center logo_congty">
                <img style="width:100%; max-height:98px" alt="Mison Trans - Công Ty TNHH Vận Tải Miên Sơn" src="https://logo.trangvangvietnam.com/L39573317300-2.gif">
            </div>
            <div class="logo_congty_diachi">
                <div class="pt-0 pb-2 ps-3 pe-4"><span class="nganh_listing"><i class="fa fa-solid fa-layer-group pe-1"></i>NGÀNH:</span> <span class="nganh_listing_txt fw500">Logistics - Dịch Vụ Logistics </span></div>
                <div class="pt-0 pb-2 ps-3 pe-4"><small><i class="fa fa-solid fa-location-dot pe-1 text-black-50"></i>  13 Đường Số 7, KDC Cityland Center Hills, Phường 7, Quận Gò Vấp, <span class="fw500">TP. Hồ Chí Minh</span>, Việt Nam</small></div>
                <div class="pt-0 pb-2 ps-3 pe-4 listing_dienthoai">
                    <i class="fa fa-solid fa-phone-volume text-black-50 pe-1"></i> 
                    <a href="tel:02873036348">(028) 73036348</a>
                </div>
                
                <div class="pt-0 pb-2 ps-3 pe-4"><i class="fa fa-solid fa-mobile-screen-button pe-1 text-black-50"></i> Hotline: <span class="fw500"><a href="tel:1900636348">1900 636 348</a></span> </div>
                
            </div>
            
            <p class="m-0 clearfix"></p>
        </div>
     </div>
</div>
`;

// Test parser
const $ = cheerio.load(htmlSample);

console.log('=== TEST TRANGVANG PARSER ===\n');

// Test 1: Find containers
const containers = $('div.w-100.h-auto.shadow.rounded-3.bg-white.p-2.mb-3');
console.log(`1. Found ${containers.length} containers`);

// Test 2: Find company name
containers.each((index, element) => {
    const $container = $(element);
    
    const $nameLink = $container.find('h2.fs-5 a').first();
    const name = $nameLink.text().trim();
    const detailUrl = $nameLink.attr('href');
    
    console.log(`\n2. Company name: ${name}`);
    console.log(`   Detail URL: ${detailUrl}`);
    
    // Test 3: Address
    let address = '';
    $container.find('i.fa-location-dot').parent('small').each((i, el) => {
        address = $(el).text().replace(/\s+/g, ' ').trim();
    });
    console.log(`\n3. Address: ${address}`);
    
    // Test 4: Phones
    const phones = [];
    $container.find('a[href^="tel:"]').each((i, phoneLink) => {
        const phoneText = $(phoneLink).text().trim();
        if (phoneText) phones.push(phoneText);
    });
    console.log(`\n4. Phones: ${phones.join(', ')}`);
    
    // Test 5: Industry
    const industry = $container.find('.nganh_listing_txt').text().trim();
    console.log(`\n5. Industry: ${industry}`);
});

console.log('\n=== TEST COMPLETED ===');
