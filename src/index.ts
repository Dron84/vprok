import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import fs from 'fs';

const [url, region] = process.argv.slice(2);

if (!url || !region) {
    console.error('Usage: node index.js <url> <region>');
    process.exit(1);
}

const sleep = async (ms: number): Promise<void> => await new Promise(resolve => setTimeout(resolve, ms));

(async () => {
    const browser = await puppeteer.launch({
        headless: false,
        waitForInitialPage: true,
        defaultViewport: { width: 1280, height: 800 }
    });
    const page = await browser.newPage();

    // Установка региона
    await page.goto('https://www.vprok.ru', { waitUntil: 'networkidle2' });
    await page.waitForSelector('#freePortal')
    const content = await page.content();
    const $ = cheerio.load(content)
    const divs = $('div')

    const matchingRegionElements: string[] = []

    $(divs).each((index, element) => {
        const className = $(element).attr('class') as string; // Получаем имя класса
        if (/UiHeaderHorizontalBase_region__/.test(className)) {
            matchingRegionElements.push(className)
        }

    })

    await sleep(2000) // с плохим интернет соединением не успивает переключить регион 
    //так как там есть уведомление о карте лояльности которое тут же закрывает нажатое окно 
    // это  можно дорабатывать но не в рамках тех задания

    if (matchingRegionElements.length) {
        try {
            await page.waitForSelector(`.${matchingRegionElements[0]}`, { visible: true })
            await page.click(`.${matchingRegionElements[0]}`)
            const content = await page.content();
            const $ = cheerio.load(content)
            const uls = $('ul')
            const regionULElement: any[] = []
            $(uls).each((index, element) => {
                const className = $(element).attr('class') as string; // Получаем имя класса
                if (/UiRegionListBase_list__/.test(className)) {
                    const lis = $(element).find('li')
                    $(lis).each((index, li) => {
                        const cn = $(li).attr("class")?.split(/\s/)
                        const text = $(li).text().trim()
                        if (text === region.trim()) {
                            regionULElement.push(cn?.[0])
                            regionULElement.push(index + 1)
                            regionULElement.push(li)
                        }
                    })

                }
            })
            if (regionULElement.length) {
                const regionSelector = `li.${regionULElement[0]}:nth-child(${regionULElement[1]})`
                await page.waitForSelector(regionSelector)
                await page.click(regionSelector)
            }
        } catch (e) {
            console.log("Err", e)
        }
    }

    await sleep(2000)


    // Переход к странице товара
    try {
        await page.goto(url, { waitUntil: 'networkidle2' });
    } catch (error) {
        console.error('Error while navigating to the page:', error);
        await browser.close();
        process.exit(1);
    }

    const ctx = await page.content()
    const title = $(ctx).find('h1[itemprop="name"]').text()

    const ais = $(ctx).find('a')
    let rate: null | number = null
    let review: null | string = null
    $(ais).each((index, element) => {
        const className = $(element).attr('class') as string; // Получаем имя класса
        if (/ActionsRow_stars__/.test(className)) {
            //получаем рейтинг
            rate = Number($(element).text().trim())
        }
        if (/ActionsRow_reviews__/.test(className)) {
            //получаем отзывы тут тоже можно еще доработать и забироть информацию без текста в числах и преобразовывать 2к в 2000
            // function convertToNumber(value: string): number {
            //     const numberValue = parseFloat(value);
            //     if (value.endsWith('k')) {
            //         return numberValue * 1000;
            //     } else if (value.endsWith('M')) {
            //         return numberValue * 1000000;
            //     } else if (value.endsWith('B')) {
            //         return numberValue * 1000000000;
            //     }
            //     return numberValue; // Возвращаем число, если нет суффикса
            // }
            review = $(element).text().trim()
        }
    })

    const spans = $(ctx).find("span")
    let oldPrice: null | number = null
    let discountPrice: null | Number = null
    let regularPrice: null | number = null

    $(spans).each((index, element) => {
        const className = $(element).attr('class') as string; // Получаем имя класса
        // находим класс с ценой по умолчанию
        if (/Price_role_regular__/.test(className)) {
            // тут получаем данные о цене и убераем лишнее тут безусловно не обработаны варианты когде весовой товар или еще какой либо
            regularPrice = Number($(element).text().trim().replace(',', '.').replace('₽/шт', ''))
        }

        // находим класс с старой ценой
        if (/Price_role_old/.test(className)) {
            oldPrice = Number($(element).text().trim().replace(',', '.').replace('₽', ''))
        }

        // находим класс с новой ценой
        if (/Price_role_discount__/.test(className)) {
            // тут получаем данные о цене и убераем лишнее тут безусловно не обработаны варианты когде весовой товар или еще какой либо
            discountPrice = Number($(element).text().trim().replace(',', '.').replace('₽/шт', ''))
        }
    })

    // Скриншот страницы
    await page.screenshot({ path: 'screenshot.jpg', fullPage: true });

    // сохраняем в файл на диске
    fs.writeFileSync('product.txt', regularPrice ? JSON.stringify({ rate, review, regularPrice, title }) : JSON.stringify({ rate, review, oldPrice, discountPrice, title }))

    console.log('title', title)
    console.log('rate', rate)
    console.log('review', review)
    if (regularPrice) {
        console.log('regularPrice', regularPrice);
    } else {
        console.log('oldPrice', oldPrice)
        console.log('discountPrice', discountPrice)
    }

    // await browser.close();
})();
