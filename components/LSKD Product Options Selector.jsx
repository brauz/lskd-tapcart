import * as React from "react"
import {
    Text,
    SelectorContainer,
    Selectors,
    useProducts,
    useProductOptions,
    productGidFromId,
    variantGidFromId,
    ScrollArea,
    cn,
    Drawer,
    DrawerContent,
    DrawerContentBase,
    Html
} from "@tapcart/mobile-components"

const REGION = "AU"; //AU OR US

const STORE_NAME = {
    AU: 'loosekid',
    US: 'loosekid-us'
};

const TOKEN = {
    AU: "adf030af27addd2acf6906f4b810d150",
    US: "2d6c85b567bb77eb954d948efe18c605",
};

const ASSET_ID = {
    AU: 683,
    US: 76
}

const OPTION_GROUPS = [
    {
        name: "Pockets",
        tagPrefix: "pockets:",
    },
    {
        name: "Cup Size",
        tagPrefix: "cupsize:",
    },
    {
        name: "Bag Size",
        tagPrefix: "bagsize:",
    },
    {
        name: "Towel Size",
        tagPrefix: "towelsize:",
    },
    {
        name: "Short Liner",
        tagPrefix: "shortliner:",
    },
    {
        name: "Waistband",
        tagPrefix: "waistband:",
    },
    {
        name: "Length",
        tagPrefix: "length:",
    },
];

const SORTED_LENGTH = [
    'X Short',
    '4" Short',
    'Mid Short',
    '6" Short',
    'Bike Short',
    '9" Short',
    '3/4 Length',
    '7/8 Length',
    'Full Length',
    'X Long',
    'Tall'
];


const fetchProductOptionGroups = async (product, countryCode) => {
    const handleTag = product.tags.find((tag) => tag.startsWith("handle-"));
    const groupTag = product.tags.find((tag) => tag.startsWith("YGroup_"));
    const colorGroupTag = product.tags.find((tag) =>
        tag.startsWith("colourSwatch:")
    );
    const isOGProduct = product.tags.find((tag) => tag.startsWith("batch:OG"));

    const query = STOREFRONT_API(`#graphql
        query searchProducts($colorQuery: String!, $groupQuery: String!, $countryCode: CountryCode!) @inContext(country: $countryCode) {
            colors: products(first: 50, query: $colorQuery) {
                nodes {
                    ... ProductParts
                }
            }
            groups: products(first: 50, query: $groupQuery) {
                nodes {
                    ... ProductParts
                }
            }
        }

        fragment ProductParts on Product {
            id
            title
            tags
            availableForSale
						priceRange {
							minVariantPrice {
								amount
								currencyCode
							}
						}
            featuredImage {
                url
            }
            variants(first: 25) {
                nodes {
                    id,
										availableForSale,
                    selectedOptions {
                        name
                        value
                    }
                }
            }
        }
    `);

    const { data } = await query({
        colorQuery: `tag:"${handleTag}"`,
        groupQuery: `tag:"${groupTag}" AND tag:"${colorGroupTag}" AND ${isOGProduct ? "tag:'batch:OG'" : "NOT tag:'batch:OG'"
            }`,
        countryCode,
    });

    const colorGroups = (
        handleTag
            ? data.colors.nodes.filter(({ tags }) => tags.includes(handleTag))
            : []
    )
        .filter(
            (product) =>
                product.availableForSale || product.tags.includes("BACK-IN-STOCK")
        )
        .sort((a, b) => {
            // 1. Sort by availability
            if (a.availableForSale !== b.availableForSale) {
                return a.availableForSale ? -1 : 1;
            }

            // 2. Sort by price (higher prices first = less discounted prioritized)
            const aPrice = a.priceRange.minVariantPrice.amount;
            const bPrice = b.priceRange.minVariantPrice.amount;
            const priceDiff = bPrice - aPrice;
            if (priceDiff !== 0) {
                return priceDiff;
            }

            // 3. Core product ("Black") is prioritized first after availability and price
            const aColor = a.title.split(" - ").pop()?.toLowerCase();
            const bColor = b.title.split(" - ").pop()?.toLowerCase();

            if (aColor === "black") return -1;
            if (bColor === "black") return 1;

            // 4. SKU availability (variant with more available sizes is prioritized)
            if (a.variants?.nodes?.length > 0 && b.variants?.nodes?.length > 0) {
                const aAvailability = a.variants.nodes.filter(variant => variant.availableForSale).length / a.variants.nodes.length;
                const bAvailability = b.variants.nodes.filter(variant => variant.availableForSale).length / b.variants.nodes.length;
                const availabilityDiff = bAvailability - aAvailability;

                if (availabilityDiff !== 0) {
                    return availabilityDiff;
                }
            }

            // Default case (no change in order)
            return 0;
        })
        .map((product) => {
            const swatch = product.tags.find((tag) =>
                tag.startsWith("colourSwatch:")
            );
            let colourNamePrint, swatchColor;

            if (swatch) {
                const [_, colour] = swatch.split(":");
                if (colour) {
                    const [swatchName, primaryColour, ...secondaryColours] =
                        colour.split("|");
                    colourNamePrint = swatchName;
                    if (primaryColour) {
                        if (primaryColour.startsWith("#")) {
                            const gradientStops = [primaryColour, ...secondaryColours]
                                .reverse()
                                .map(
                                    (hexCode, index) =>
                                        `${hexCode} 0 ${(index + 1) * (100 / (secondaryColours.length + 1))
                                        }%`
                                )
                                .join(", ");
                            swatchColor = `conic-gradient(${gradientStops})`;
                        } else if (primaryColour.includes(".jpg")) {
                            swatchColor = `url('https://lskd.co/cdn/shop/t/${ASSET_ID[REGION]}/assets/${primaryColour}') no-repeat center center / cover`;
                        }
                    } else {
                        swatchColor = swatchName;
                    }
                }
            }

            return {
                ...product,
                colourNamePrint,
                swatchColor,
            };
        });

    const optionGroupSelections = OPTION_GROUPS.reduce((acc, { tagPrefix }) => {
        acc[tagPrefix] = product.tags.find((tag) => tag.startsWith(tagPrefix));

        return acc;
    }, {});

    const optionGroups = OPTION_GROUPS.map(({ name, tagPrefix }) => {
        const options = optionGroupSelections[tagPrefix]
            ? data.groups.nodes
                .filter(({ tags }) => {
                    const candidateTag = tags.find((tag) => tag.startsWith(tagPrefix));
                    if (!candidateTag) return false;

                    return Object.entries(optionGroupSelections).every(
                        ([prefix, selectedTag]) => {
                            if (prefix === tagPrefix) return true; // let this vary
                            if (!selectedTag) return true; // if no selection on this prefix, don't filter it
                            return tags.includes(selectedTag);
                        }
                    );
                })
                .sort((a, b) => {
                    const aName = a.tags
                        .find((tag) => tag.startsWith(tagPrefix))
                        ?.replace(tagPrefix, "");
                    const bName = b.tags
                        .find((tag) => tag.startsWith(tagPrefix))
                        ?.replace(tagPrefix, "");
                    return name.toLowerCase() === "length"
                        ? SORTED_LENGTH.indexOf(aName) - SORTED_LENGTH.indexOf(bName)
                        : aName.localeCompare(bName);
                })
            : [];

        return options.length
            ? {
                name,
                options,
            }
            : null;
    }).filter(Boolean);

    return {
        colorGroups,
        optionGroups,
    };
};

const fetchProductSizeGuide = async (product, countryCode) => {
    const sizePageHandle = product.tags.find((tag) => tag.startsWith("SizeChart_"));
    const query = STOREFRONT_API(`#graphql
        query getProductSizeGuide($pageHandle: String!, $countryCode: CountryCode!) @inContext(country: $countryCode) {
            page(handle: $pageHandle){
                body
            }
        }
    `);

    const { data } = await query({
        pageHandle: sizePageHandle,
        countryCode,
    });

    return data.page?.body
};

const useProductOptionGroups = (product, countryCode) => {
    const [productOptionGroups, setProductOptionGroups] = React.useState({
        colorGroups: [],
        optionGroups: []
    });

    React.useEffect(() => {
        if (!product) return;

        const hydrate = async () => {
            try {
                const groups = await fetchProductOptionGroups(product, countryCode);
                setProductOptionGroups(groups);
            } catch (error) {
                console.error(error?.message)
            }
        }

        hydrate();
    }, [product?.id, countryCode]);

    return productOptionGroups;
}

const useProductSizeGuide = (product, countryCode) => {
    const [sizeGuidePage, setSizeGuidePage] = React.useState();

    React.useEffect(() => {
        if (!product) return;

        const hydrate = async () => {
            try {
                const page = await fetchProductSizeGuide(product, countryCode);
                setSizeGuidePage(page);
            } catch (error) {
                console.error(error?.message)
            }
        }

        hydrate();
    }, [product?.id, countryCode]);

    return {
        sizeGuidePage
    };
}

// #region =-=-=-=-= UTILITY FUNCTIONS =-=-=-=-=
const isOptionDisabled = (
    selectedOptions,
    optionType,
    optionValue,
    variants
) => {
    return !variants.some(
        (variant) =>
            variant.availableForSale &&
            variant.selectedOptions.every((option) => {
                if (option.name === optionType) {
                    return option.value === optionValue
                }
                return selectedOptions[option.name] === option.value
            })
    )
}
// #endregion =-=-=-= END UTILITY FUNCTIONS =-=-=-=

// #region =-=-=-= SMALL COMPONENTS =-=-=-=
const SizeGuidePage = ({ isOpen, onClose, sizeGuidePage } = {}) => {
    const sizePageRef = React.useRef(null);

    React.useEffect(() => {
        if (!isOpen || !sizeGuidePage) return;

        let timeoutId;
        const tabLinks = [];

        const onClickTab = (tabGroupIndex) => (e) => {
            e.preventDefault();
            const el = sizePageRef.current;
            if (!el) return;

            let tabGroups = Array.from(el.querySelectorAll(".sz-tabs__content-wrapper [id^=tabs-content"));
            if (tabGroups.length === 0) {
                tabGroups = Array.from(el.querySelectorAll("[id^=tabs-content]"));
            }

            const targetTabGroup = tabGroups[tabGroupIndex];
            if (!targetTabGroup) return;

            const allTabs = Array.from(targetTabGroup.querySelectorAll(".tab-content"));
            const targetId = e.currentTarget.getAttribute("href").substring(1);

            allTabs.forEach((tab) => {
                tab.style.display = tab.id === targetId ? "block" : "none";
            });

            tabLinks[tabGroupIndex]?.forEach(({ link }) => link.classList.remove("active"));
            e.currentTarget.classList.add("active");
        };

        timeoutId = setTimeout(() => {
            const el = sizePageRef.current;
            if (!el) return;

            let tabGroups = Array.from(el.querySelectorAll(".sz-tabs__content-wrapper [id^=tabs-content"));
            if (tabGroups.length === 0) {
                tabGroups = Array.from(el.querySelectorAll("[id^=tabs-content]"));
            }

            tabGroups.forEach((tabGroup, tabGroupIndex) => {
                const allTabs = tabGroup.querySelectorAll(".tab-content");
                allTabs.forEach((tab, i) => {
                    tab.style.display = i === 0 ? "block" : "none";
                });

                const linksContainer = tabGroup.previousElementSibling;

                tabLinks[tabGroupIndex] = Array.from(linksContainer && linksContainer.querySelectorAll("a")).map((link, index) => {
                    const handler = onClickTab(tabGroupIndex);
                    link.addEventListener("click", handler);
                    if (index === 0) link.classList.add("active");
                    return { link, handler };
                });
            });
        }, 0);

        return () => {
            clearTimeout(timeoutId);
            tabLinks.forEach(group => {
                group.forEach(({ link, handler }) => {
                    link.removeEventListener("click", handler);
                });
            });
        };
    }, [isOpen, sizeGuidePage]);

    return (
        <>
            <style>{`.medium-up--hide {display: none !important;}.tabs-nav {list-style: none;display: flex;padding-left: 0;}.tab-content {display: none;}.tab-content.active {display: block;}.tabs-nav a.active {background: #555555;color: white;}.tabs-nav a {width: 100%;display: flex;justify-content: center;color: #C5C5C5;padding: 5px 0;background: white;}.tabs-nav {margin-top: 15px;width: 100%;}.tabs-nav li {font-weight: bold;width: 50%;}table {width: 100%;border-collapse: collapse;}th, td {border: 1px solid #ccc;padding: 8px;text-align: center;}.sizechart_table {background: white;color: black;margin-bottom: 15px;}.grid__item {display: flex;flex-direction: column;gap: 15px;}.grid__size {margin-bottom: 15px !important;}.size-guide-lskd h2 {font-size: 30px;font-weight: bold;}.size-guide-lskd table {table-layout: fixed;}.size-guide-lskd td {width: 25%;table-layout: fixed;}`}</style>
            <Drawer open={isOpen} onClose={onClose}>
                <DrawerContentBase
                    style={{
                        background: "rgb(208, 207, 207)"
                    }}
                    backdropHexColor="#000000"
                    onPointerDownOutside={onClose}
                >
                    <DrawerContent>
                        <div className="w-full size-guide-lskd" style={{
                            fontWeight: 300,
                            fontSize: 12,
                            background: "rgb(208, 207, 207)",
                            padding: "8px 16px"
                        }} ref={sizePageRef}>
                            <Html html={sizeGuidePage} />
                        </div>
                    </DrawerContent>
                </DrawerContentBase>
            </Drawer>
        </>
    )
}

const MemoizedSelectors = React.memo(function MemoizedSelectors({
    option,
    handleSelect,
    selectedOptions,
    variants
}) {
    const containerRef = React.useRef(null)

    const handleFocusSelector = (index) => {
        const currentSelector = containerRef.current.children[index]
        currentSelector.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "center",
        })
    }

    return (
        <SelectorContainer containerRef={containerRef} className="h-auto px-0">
            {option.values.map((value, j) => {
                const isSelected = selectedOptions[option.name] === value
                const isSoldOut = isOptionDisabled(
                    selectedOptions,
                    option.name,
                    value,
                    variants
                )
                return (
                    <Selectors
                        label={`${option.name}: ${value}`}
                        value={value}
                        key={`${value}_${j}`}
                        selected={isSelected}
                        disabled={isSoldOut}
                        disabledClick={false}
                        onSelect={() => {
                            handleSelect(option.name, value)
                            handleFocusSelector(j)
                        }}
                        className="outline-0"
                        style={{
                            cursor: 'pointer',
                            border: '0px solid',
                            borderColor: isSoldOut ? '#d3d3d3' : '#000',
                            borderRadius: '9999px',
                            aspectRatio: '1/1',
                            width: '40px',
                            fontSize: '12px',
                            fontWeight: 300,
                            whiteSpace: 'nowrap',
                            ...(value.length > 3 ? {
                                aspectRatio: 'auto',
                                padding: '6px 8px',
                                minWidth: 'unset'
                            } : {}),
                            ...(isSelected ? {
                                backgroundColor: '#000',
                                color: '#fff'
                            } : {}),
                            ...(isSoldOut ? {
                                backgroundColor: '#f3f3f4',
                                color: '#c9cacc',
                                pointerEvents: 'none'
                            } : {})
                        }}
                        children={value}
                    />
                )
            })}
        </SelectorContainer>
    )
})

// #endregion =-=-=-= END SMALL COMPONENTS =-=-=-=

export default function ProductOptionsSelector({
    pageState,
    useSearchParams,
    useActions,
    useTapcart,
}) {
    const searchParams = useSearchParams()
    const actions = useActions();
    const Tapcart = useTapcart();
    const productId = productGidFromId(
        searchParams.get("productId") || pageState.searchParams.productId
    )
    const productHandle =
        searchParams.get("productHandle") || pageState.searchParams.productHandle
    const variantId = variantGidFromId(
        searchParams.get("variantId") || pageState.searchParams.variantId
    )

    const countryCode = (
        searchParams.get('country') ||
        Tapcart.variables?.cart?.currency?.slice?.(0, 2) ||
        pageState.country ||
        REGION
    ).toUpperCase();

    const { products: [product] = [] } = useProducts({
        productIds: productId && [productId],
        productHandles: productHandle && [productHandle],
        baseURL: pageState.baseAPIURL,
        queryVariables: {
            country: countryCode,
            mediaLimit: 100,
        },
    }) || {}

    const {
        colorGroups,
        optionGroups
    } = useProductOptionGroups(product, countryCode);


    const [, colorName] = product?.title.split(/\s-\s/).map((val) => val.trim()) ?? [];

    const variants = product?.variants

    const {
        selectedOptions,
        handleSelect: handleSelectState,
        selectedVariant,
    } = useProductOptions(variants, variantId)

    if (!variantId) {
        delete selectedOptions.Size
    }

    const [hasUpdatedVariant, setHasUpdatedVariant] = React.useState(false)
    const [isSizeGuideOpen, setIsSizeGuideOpen] = React.useState(false);

    const handleSelect = React.useCallback(
        (name, value) => {
            handleSelectState(name, value)
            setHasUpdatedVariant(true)
        },
        [handleSelectState, setHasUpdatedVariant]
    )

    React.useEffect(() => {
        if (hasUpdatedVariant) {
            const url = window.location ? new URL(window.location.href) : ""
            url.searchParams?.set("variantId", selectedVariant?.id)
            window.history.pushState({}, "", url.toString())
        }
    }, [selectedVariant, hasUpdatedVariant])

    const { sizeGuidePage } = useProductSizeGuide(product, countryCode);

    const hasVariants = !(
        variants?.length === 1 && variants?.[0]?.title === "Default Title"
    ) || Boolean(colorGroups.length) || optionGroups.some(({ options }) => options.length > 1);

    if (!hasVariants) return null

    const productOptions = product?.options?.filter((option) => option.values.length > 1 && option.name.trim().toLowerCase() !== 'colour')

    return (
        <>
            <style>{`
                .hide-scrollbar {
                    scrollbar-width: none; /* Firefox */
                    -ms-overflow-style: none; /* Internet Explorer and Edge */
                }

                .hide-scrollbar::-webkit-scrollbar {
                    display: none; /* Chrome, Safari, and Opera */
                }
            `}</style>
            <div
                style={{
                    padding: '8px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    rowGap: '3rem',
                    marginTop: '12px',
                    marginBottom: '20px'
                }}
            >
                {colorGroups?.length > 1 && <div>
                    <Text
                        type="body-primary"
                        className={cn(
                            "mb-4",
                            "text-[14px]"
                        )}
                        style={{ textWrap: "wrap", fontWeight: 300, textTransform: 'uppercase' }}
                    >
                        Colour: <span style={{ textTransform: 'capitalize', color: '#888' }}>{colorName}</span>
                    </Text>
                    <ScrollArea className="w-full" scrollbar={false}>
                        <div style={{
                            display: 'flex',
                            gap: '8px',
                        }}>
                            {
                                colorGroups.map(group => {
                                    const isSelected = group.id === product?.id;
                                    const relevantVariant = group.variants.nodes.find((variant) =>
                                        variant.selectedOptions.every(({ name, value }) =>
                                            name.trim().toLowerCase() === 'colour' || value === selectedOptions[name]
                                        )
                                    )
                                    return (
                                        <div onClick={() => {
                                            actions.action?.('trigger/haptic');

                                            const url = window.location ? new URL(window.location.href) : ""
                                            url.searchParams?.set("variantId", relevantVariant?.id)
                                            url.searchParams?.set("productId", group?.id)
                                            window.history.pushState({}, "", url.toString())
                                        }} style={{
                                            display: 'inline-block',
                                            padding: '2px',
                                            borderRadius: '9999px',
                                            border: `1px solid ${isSelected ? '#000000' : '#cfd4dd'}`,
                                            background: 'transparent',
                                            cursor: 'pointer'
                                        }}>
                                            <div
                                                style={{
                                                    borderRadius: '9999px',
                                                    width: '26px',
                                                    height: '26px',
                                                    background: group.swatchColor
                                                }}
                                                title={group.name}
                                                aria-label={group.name}
                                            />
                                        </div>
                                    )
                                })
                            }
                        </div>
                    </ScrollArea>
                </div>}

                {optionGroups.map(({ name, options }) => {
                    if (options.length <= 1) return null;

                    const optionTagPrefix = OPTION_GROUPS.find((opt) => name === opt.name).tagPrefix;

                    const selectedOptionName = product?.tags.find((tag) => tag.startsWith(optionTagPrefix)).replace(optionTagPrefix, '');

                    return <div key={`option-group-${name}-${product?.id}`}>
                        <Text
                            type="body-primary"
                            className={cn(
                                "mb-4",
                                "text-[14px]"
                            )}
                            style={{ textWrap: "wrap", fontWeight: 300, textTransform: 'uppercase' }}
                        >
                            {name}: {selectedOptionName && <span style={{ color: '#888', textTransform: 'capitalize' }}>{selectedOptionName}</span>}
                        </Text>

                        <div className='hide-scrollbar' style={{
                            display: 'flex',
                            gap: '12px',
                            overflowX: 'scroll'
                        }}>
                            {options.map((option) => {
                                const isSelected = option.id === product?.id;

                                const relevantVariant = option.variants.nodes.find((variant) =>
                                    variant.selectedOptions.every(({ name, value }) =>
                                        name.trim().toLowerCase() === 'colour' || value === selectedOptions[name]
                                    )
                                )

                                const optionName = option.tags.find((tag) => tag.startsWith(optionTagPrefix)).replace(optionTagPrefix, '');

                                return <div onClick={() => {
                                    actions.action?.('trigger/haptic');

                                    const url = window.location ? new URL(window.location.href) : ""
                                    url.searchParams?.set("variantId", relevantVariant?.id)
                                    url.searchParams?.set("productId", option?.id)
                                    window.history.pushState({}, "", url.toString())
                                }} style={{
                                    cursor: 'pointer',
                                    padding: '6px 16px',
                                    border: '0px solid black',
                                    borderRadius: '25px',
                                    width: 'min-content',
                                    whiteSpace: 'nowrap',
                                    fontWeight: 300,
                                    fontSize: '12px',
                                    ...(isSelected ? {
                                        backgroundColor: '#000',
                                        color: '#fff'
                                    } : {})
                                }}>{optionName}</div>
                            })}
                        </div>
                    </div>
                })}

                {productOptions?.map((option, i) => (
                    <div key={`${option}_${i}`}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text
                                type="body-primary"
                                className={cn(
                                    "mb-3",
                                    "text-[14px]"
                                )}
                                style={{ textWrap: "wrap", fontWeight: 300, textTransform: 'uppercase' }}
                            >
                                {option.name}: <span style={{ color: '#888', textTransform: 'capitalize' }}>{selectedOptions[option.name]}</span>
                            </Text>
                            {option.name.toLowerCase() === 'size' && (
                                <div className="flex items-center gap-1" onClick={() => setIsSizeGuideOpen(true)}>
                                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{ width: "17px", height: "17px" }}><g fill="none"><g stroke="#707171" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="m9 9h11-.00000004c.552285.00000002 1-.447715 1-1v-4c0-.552285-.447715-1-1-1h-11-.00000026c-3.31371.00000014-6 2.68629-6 6v6"></path><circle cx="9" cy="15" r="6"></circle><circle cx="9" cy="15" r="2"></circle><path d="m9 3v2"></path><path d="m12 3v3"></path><path d="m15 3v2"></path><path d="m18 3v3"></path></g><path d="m0 0h24v24h-24z" transform="matrix(-1 0 0 -1 24 24)"></path></g></svg>
                                    <Text
                                        type="body-primary"
                                        className={cn(
                                            "mb-1",
                                            "line-clamp-1"
                                        )}
                                        style={{ textWrap: "wrap", fontWeight: 300, fontSize: '11px', cursor: 'pointer' }}
                                    >
                                        Size Guide
                                    </Text>
                                </div>
                            )}
                        </div>
                        <MemoizedSelectors
                            option={option}
                            handleSelect={handleSelect}
                            selectedOptions={selectedOptions}
                            variants={variants}
                        />
                    </div>
                ))}
            </div>
            <SizeGuidePage isOpen={isSizeGuideOpen} onClose={() => setIsSizeGuideOpen(false)} sizeGuidePage={sizeGuidePage} />
        </>
    )
}

const STOREFRONT_API = (query) => {
    return async function (variables = {}) {
        const url = `https://${STORE_NAME[REGION]}.myshopify.com/api/2025-10/graphql.json`;

        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Shopify-Storefront-Access-Token": TOKEN[REGION],
            },
            body: JSON.stringify({
                query,
                variables,
            }),
        });

        return res.json();
    };
}