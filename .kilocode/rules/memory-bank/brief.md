* Building an app to find investment opportunities in stocks
* The app will have an increasing number of features so it should be as modular as possible
* For now we will use eodhd.com fundamentals subscription api to get the stock's fundamentals data. This should be modular though because in the future we could be getting data from multiple providers, i.e. financialmodelingprep.com
* the app will provide a ui to the user
* in the UI we need to create a settings page were the user con configure the app behavior. The first setting will be for the user to provide their eodhd.com api key 
* the first feature we will be working on is a screener for the stocks included in dataroma.com grand portfolio this is how it will work:
    1. in the user home page we will present him with a Dataroma Screener flow to scrape the data from dataroma
    2. we ask the user if he wants to cache/reuse cached data
    3. if not using cache we will scrape the Grand Portfolio list from https://www.dataroma.com/m/g/portfolio.php
    4. For now we will just scaffold the scraper. We will then implement it once we will be provided with the structure of the pages to scrape we il get the `Symbol` and `Stock` for every stock included in the Grand Portfolio
    5. if not using cache we need to run two queries to build the universe of stocks covered by eodhd:
        - get the list of all exchanges https://eodhd.com/api/exchanges-list/?api_token={YOUR_API_TOKEN}&fmt=json
        this is a partial return of the json:
        [{"Name":"USA Stocks","Code":"US","OperatingMIC":"XNAS, XNYS, OTCM","Country":"USA","Currency":"USD","CountryISO2":"US","CountryISO3":"USA"},{"Name":"London Exchange","Code":"LSE","OperatingMIC":"XLON","Country":"UK","Currency":"GBP","CountryISO2":"GB","CountryISO3":"GBR"},{"Name":"Toronto Exchange","Code":"TO","OperatingMIC":"XTSE","Country":"Canada","Currency":"CAD","CountryISO2":"CA","CountryISO3":"CAN"},{"Name":"NEO Exchange","Code":"NEO","OperatingMIC":"NEOE","Country":"Canada","Currency":"CAD","CountryISO2":"CA","CountryISO3":"CAN"},{"Name":"TSX Venture Exchange","Code":"V","OperatingMIC":"XTSX","Country":"Canada","Currency":"CAD","CountryISO2":"CA","CountryISO3":"CAN"},{"Name":"Berlin Exchange","Code":"BE","OperatingMIC":"XBER","Country":"Germany","Currency":"EUR","CountryISO2":"DE","CountryISO3":"DEU"}]
        - get the list of all the stocks in each exchange https://eodhd.com/api/exchange-symbol-list/{EXCHANGE_CODE}?type=common_stock&api_token={YOUR_API_TOKEN}&fmt=json
        this is a partial return of the json:
        [{"Code":"A","Name":"Agilent Technologies Inc","Country":"USA","Exchange":"NYSE","Currency":"USD","Type":"Common Stock","Isin":"US00846U1016"},{"Code":"AA","Name":"Alcoa Corp","Country":"USA","Exchange":"NYSE","Currency":"USD","Type":"Common Stock","Isin":"US0138721065"},{"Code":"AABB","Name":"Asia Broadband Inc","Country":"USA","Exchange":"PINK","Currency":"USD","Type":"Common Stock","Isin":"US04518L1008"},{"Code":"AABVF","Name":"Aberdeen International Inc","Country":"USA","Exchange":"PINK","Currency":"USD","Type":"Common Stock","Isin":null},{"Code":"AACAF","Name":"AAC Technologies Holdings Inc","Country":"USA","Exchange":"PINK","Currency":"USD","Type":"Common Stock","Isin":null},{"Code":"AACAY","Name":"AAC Technologies Holdings Inc","Country":"USA","Exchange":"PINK","Currency":"USD","Type":"Common Stock","Isin":"US0003041052"},{"Code":"AACB","Name":"Artius II Acquisition Inc. Class A Ordinary Shares","Country":"USA","Exchange":"NASDAQ","Currency":"USD","Type":"Common Stock","Isin":"KYG0509J1159"}]
    6. we then need to try to check if the stocks included in the grand portfolio. For this we need to try to match a combination of dataroma `Symbol` with eodhd `Code` for the stock and `Stock` with eodhd `Name` for the stock
    7. we will return a table to the user:
        * that includes:
            - `DATAROMA_SYMBOL`
            - `DATAROMA_STOCK`
            - `EODHD_STOCK_CODE`
            - `EODHD_STOCK_NAME`
            - confidence in the match expressed as a percentage
        * the table will be sorted by ascending confidence
        * the field `Name` will be a searchable dropdown so that the user can pickup a better match or mark it as not available in eodhd by selecting "not available"
    8. once the user validates the matches we will query eodhd to get all the fundamental data regarding that stock with the following query: https://eodhd.com/api/fundamentals/{EODHD_STOCK_CODE}.{EXCHANGE_CODE}?api_token=demo&fmt=json
    9.  provide him with stock screener table that will include:
        - `EODHD_STOCK_CODE`
        - `EODHD_STOCK_NAME`
        - trailing P/E
        - forward P/E
        - forward annual dividend yield
        - latest fiscal year free cash flow divided by latest fiscal year revenues

