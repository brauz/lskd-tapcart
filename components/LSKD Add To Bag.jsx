import * as React from "react";
import {
  Container,
  Text,
  Icon,
  Button,
  Favorite,
  useProducts,
  useProductOptions,
  getColor,
  cn,
  getBackgroundAndPaddingStyle,
  getTextStyle,
  productGidFromId,
  variantGidFromId,
  getIdFromGid,
  isFavoriteIntegrationEnabled,
  Image,
  Money,
} from "@tapcart/mobile-components";

import { TagContent } from "@tapcart/app-studio-components"

// #region =-=-=-= UTILITY FUNCTIONS =-=-=-=
const getPrice = (variant) => {
  return {
    price: parseFloat(variant?.price?.amount),
    compareAtPrice: parseFloat(variant?.compareAtPrice?.amount),
    isSale:
      parseFloat(variant?.price?.amount) <
      parseFloat(variant?.compareAtPrice?.amount),
  };
};

// Store configuration for bra cup addon (ANZ/AU store)
const ADDON_STORE_CONFIG = {
  storeName: "loosekid",
  token: "adf030af27addd2acf6906f4b810d150",
};

// The addon product ID - push-up cup inserts
const ADDON_PRODUCT_ID = "6630914457672";

// Storefront API query helper for addon
const createStorefrontAPI = () => {
  return (query) => {
    return async function (variables = {}) {
      const url = `https://${ADDON_STORE_CONFIG.storeName}.myshopify.com/api/2024-07/graphql.json`;

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Storefront-Access-Token": ADDON_STORE_CONFIG.token,
          },
          body: JSON.stringify({
            query,
            variables,
          }),
        });

        const json = await res.json();
        return json;
      } catch (error) {
        console.error("Error fetching from Storefront API:", error);
        throw error;
      }
    };
  };
};

// Fetch addon product variants and build size mapping
const fetchAddonProduct = async (addOnProductId, country) => {
  const STOREFRONT_API = createStorefrontAPI();

  const productQuery = STOREFRONT_API(`#graphql
    query getAddonProduct($id: ID!, $country: CountryCode) @inContext(country: $country) {
      product(id: $id) {
        id
        title
        availableForSale
        variants(first: 20) {
          nodes {
            id
            title
            availableForSale
            selectedOptions {
              name
              value
            }
          }
        }
      }
    }
  `);

  try {
    const { data } = await productQuery({
      id: `gid://shopify/Product/${addOnProductId}`,
      country: country || null,
    });

    const product = data?.product;
    const variants = product?.variants?.nodes || [];

    // Build size-to-variantId mapping and track availability per variant
    const sizeMap = {};
    const variantAvailability = {};
    variants.forEach((variant) => {
      if (!variant?.selectedOptions || !Array.isArray(variant.selectedOptions))
        return;

      const sizeOption = variant.selectedOptions.find(
        (opt) => opt?.name?.toLowerCase() === "size"
      );
      if (sizeOption) {
        // Store the numeric ID (without gid prefix)
        const variantId = variant.id.split("/").pop();
        sizeMap[sizeOption.value] = variantId;
        variantAvailability[sizeOption.value] = variant.availableForSale;
      }
    });

    return {
      sizeMap,
      variantAvailability,
      isAvailable: product?.availableForSale || false,
    };
  } catch (error) {
    console.error("Error fetching addon variants:", error);
    return {
      sizeMap: {},
      variantAvailability: {},
      isAvailable: false,
    };
  }
};

// Custom hook to manage addon variants
const useAddonProduct = (country) => {
  const [sizeMap, setSizeMap] = React.useState({});
  const [variantAvailability, setVariantAvailability] = React.useState({});
  const [isAvailable, setIsAvailable] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const loadAddonProduct = async () => {
      try {
        const result = await fetchAddonProduct(ADDON_PRODUCT_ID, country);
        setSizeMap(result.sizeMap);
        setVariantAvailability(result.variantAvailability);
        setIsAvailable(result.isAvailable);
      } catch (error) {
        console.error("Error loading addon variants:", error);
        setSizeMap({});
        setVariantAvailability({});
        setIsAvailable(false);
      } finally {
        setLoading(false);
      }
    };

    loadAddonProduct();
  }, [country]);

  return { sizeMap, variantAvailability, isAvailable, loading };
};

// #endregion =-=-=-= END UTILITY FUNCTIONS =-=-=-=

const ButtonText = function CheckoutButton({
  blockConfig,
  selectedVariant,
  tapcartData,
  price,
}) {
  const textStyle = React.useMemo(() => {
    return getTextStyle({
      ...blockConfig.checkoutButton,
    });
  }, [blockConfig.checkoutButton]);

  const priceConfig = blockConfig.checkoutButton?.price;
  return (
    <Text
      type="body-primary flex flex-row"
      style={{
        ...textStyle,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {blockConfig.checkoutButton?.text}

      {blockConfig.checkoutButton?.text &&
        blockConfig.checkoutButton?.price?.enabled &&
        price?.price && <>{"\u00a0-\u00a0"}</>}

      {blockConfig.checkoutButton?.price?.enabled && price?.price && (
        <span
          style={{
            fontFamily: priceConfig?.standardFont?.family,
            fontWeight: priceConfig?.standardFont?.weight,
            fontSize: priceConfig?.standardSize,
            color: getColor(priceConfig?.standardColor),
          }}
        >
          <Money
            currency={selectedVariant?.price?.currencyCode}
            locale={tapcartData?.currency?.locale}
            price={price?.price}
          />
        </span>
      )}
    </Text>
  );
};

const ButtonSuccessText = function CheckoutButton({ blockConfig }) {
  const textStyle = React.useMemo(() => {
    return getTextStyle({
      ...blockConfig.checkoutButton,
    });
  }, [blockConfig.checkoutButton]);

  return (
    <Text
      type="body-primary flex flex-row"
      style={{
        ...textStyle,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {blockConfig.checkoutButton?.successText}
    </Text>
  );
};
function ComingSoonCountdownTimer({ metaDateTimeValue }) {
  const targetDate = React.useMemo(() => {
    const dateString = metaDateTimeValue.endsWith("Z")
      ? metaDateTimeValue
      : metaDateTimeValue.replace(" ", "T") + "Z";
    return new Date(dateString);
  }, [metaDateTimeValue]);

  const calculateTimeLeft = React.useCallback(() => {
    const diff = +targetDate - +new Date();
    if (diff <= 0) return null;

    return {
      days: Math.floor(diff / (1000 * 60 * 60 * 24)),
      hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((diff / 1000 / 60) % 60),
      seconds: Math.floor((diff / 1000) % 60),
    };
  }, [targetDate]);

  const [timeLeft, setTimeLeft] = React.useState(calculateTimeLeft);

  React.useEffect(() => {
    if (!timeLeft) return;

    const timer = setInterval(() => {
      const newTime = calculateTimeLeft();
      if (!newTime) {
        clearInterval(timer);
        setTimeLeft(null);
      } else {
        setTimeLeft(newTime);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [calculateTimeLeft, timeLeft]);

  if (!timeLeft) return null;

  // Memoize time units array
  const timeUnits = React.useMemo(
    () => [
      { val: timeLeft.days, label: "DAYS" },
      { val: timeLeft.hours, label: "HOURS" },
      { val: timeLeft.minutes, label: "MINUTES" },
      { val: timeLeft.seconds, label: "SECONDS" },
    ],
    [timeLeft]
  );

  // Memoize styles
  const containerStyle = React.useMemo(() => ({ gap: "8px" }), []);

  const labelStyle = React.useMemo(
    () => ({
      color: "white",
      textTransform: "uppercase",
      marginRight: "6px",
      lineHeight: "1",
      opacity: 0.9,
    }),
    []
  );

  const unitContainerStyle = React.useMemo(() => ({ gap: "4px" }), []);

  const valueStyle = React.useMemo(
    () => ({
      fontSize: "18px",
      textAlign: "center",
      lineHeight: "1",
      color: "white",
      minWidth: "15px",
    }),
    []
  );

  const unitLabelStyle = React.useMemo(
    () => ({
      fontSize: "8px",
      textAlign: "left",
      textTransform: "uppercase",
      color: "white",
      opacity: 0.9,
    }),
    []
  );

  return (
    <div className="flex flex-row w-full justify-between items-center m-2">
      <p
        className="font-medium whitespace-nowrap flex justify-between items-center flex-shrink-0"
        style={labelStyle}
      >
        <span>DROPS IN:</span>
      </p>
      <div
        className="flex flex-row justify-center items-center flex-shrink-0"
        style={containerStyle}
      >
        {timeUnits.map(({ val, label }) => (
          <TimeUnit
            key={label}
            value={val}
            label={label}
            valueStyle={valueStyle}
            labelStyle={unitLabelStyle}
            containerStyle={unitContainerStyle}
          />
        ))}
      </div>
    </div>
  );
}

// Memoized sub-component to prevent unnecessary re-renders
const TimeUnit = React.memo(
  ({ value, label, valueStyle, labelStyle, containerStyle }) => {
    const paddedValue = React.useMemo(
      () => String(value).padStart(2, "0"),
      [value]
    );

    return (
      <div
        className="flex flex-row items-center flex-shrink-0"
        style={containerStyle}
      >
        <p className="font-bold tabular-nums" style={valueStyle}>
          {paddedValue}
        </p>
        <p className="font-medium" style={labelStyle}>
          {label}
        </p>
      </div>
    );
  }
);
export default function AddToBagButtons({
  blockConfig,
  tapcartData,
  pageState,
  useSearchParams,
  useTapcart,
  __tapcartDashboard,
}) {
  //  #region =-=-=-= WEBBRIDGE ACTIONS =-=-=-=
  const Tapcart = useTapcart();
  const searchParams = useSearchParams();
  const animatedRef = React.useRef();
  const [showKlaviyo, setShowKlaviyo] = React.useState(false);
  const [showSuccess, setShowSuccess] = React.useState(false);
  const [altId, setAltId] = React.useState(null);
  const [altAvail, setAltAvail] = React.useState(null);
  const [altSold, setAltSold] = React.useState(null);
  const [altImage, setAltImage] = React.useState(null);

  React.useEffect(() => {
    setAltId(
      searchParams.get("altVariant") || pageState.searchParams.altVariant
    );
    setAltAvail(
      searchParams.get("altAvail") || pageState.searchParams.altAvail
    );
    setAltSold(searchParams.get("isSold") || pageState.searchParams.isSold);
    setAltImage(searchParams.get("image") || pageState.searchParams.image);
  }, [searchParams, pageState]);

  //  #region =-=-=-= INITIALIZE PRODUCT DATA =-=-=-=
  const lang = searchParams.get("lang") || pageState.locale;
  const country =
    searchParams.get("country") ||
    Tapcart.variables.cart?.currency?.slice(0, 2) ||
    pageState.country;

  const productId = productGidFromId(
    searchParams.get("productId") || pageState.searchParams.productId
  );

  const variantId = variantGidFromId(
    searchParams.get("variantId") || pageState.searchParams.variantId
  );

  const productHandle =
    searchParams.get("productHandle") || pageState.searchParams.productHandle;

  const withFavoriteButton =
    blockConfig.favorites?.enabled &&
    isFavoriteIntegrationEnabled(tapcartData.integrations);

  const { products: [product] = [] } =
    useProducts({
      productIds: productId && [productId],
      productHandles: productHandle && [productHandle],
      baseURL: pageState.baseAPIURL,
      queryVariables: {
        language: lang,
        country,
      },
    }) || {};

  const variants = product?.variants;
  const { selectedVariant, selectedOptions } = useProductOptions(
    variants,
    variantId
  );

  // #region =-=-=-= BRA CUP ADDON LOGIC =-=-=-=
  // Check if product has the required tag for bra addon
  const showBraAddon = product?.tags?.includes("feature:Removable Bra Padding");

  // Load addon product variants with country context
  const {
    sizeMap: addonSizeMap,
    variantAvailability: addonVariantAvailability,
    isAvailable: addonIsAvailable,
    loading: addonLoading,
  } = useAddonProduct(country);

  // Checkbox state for addon
  const [isAddonChecked, setIsAddonChecked] = React.useState(false);

  // Extract selected size from variant options
  const selectedSize = React.useMemo(() => {
    if (
      !selectedVariant?.selectedOptions ||
      !Array.isArray(selectedVariant.selectedOptions)
    ) {
      return null;
    }
    const sizeOption = selectedVariant.selectedOptions.find(
      (opt) => opt?.name?.toLowerCase() === "size"
    );
    return sizeOption ? sizeOption.value : null;
  }, [selectedVariant]);

  // Get addon variant ID for selected size
  const addonVariantId = React.useMemo(() => {
    if (!selectedSize || !addonSizeMap[selectedSize]) return null;
    return addonSizeMap[selectedSize];
  }, [selectedSize, addonSizeMap]);
  
  // Check if the addon variant for this specific size is available
  const addonVariantIsAvailable = React.useMemo(() => {
    if (!selectedSize || !addonVariantAvailability[selectedSize]) return false;
    return addonVariantAvailability[selectedSize];
  }, [selectedSize, addonVariantAvailability]);
  // #endregion =-=-=-= END BRA CUP ADDON LOGIC =-=-=-=

  const { metaDateTimeValue, timeDifference } = React.useMemo(() => {
    const metaValue = product?.metafields?.find(
      (m) => m?.namespace === "drop" && m?.key === "datetime"
    )?.value;

    if (!metaValue) {
      return { metaDateTimeValue: null, timeDifference: -1 };
    }

    const dateString = metaValue.endsWith("Z")
      ? metaValue
      : metaValue.replace(" ", "T") + "Z";

    const targetTime = +new Date(dateString);
    const currentTime = +new Date();
    const diff = targetTime - currentTime;

    return {
      metaDateTimeValue: metaValue,
      timeDifference: diff,
    };
  }, [product?.metafields]);

  const klaviyoIntegration = tapcartData.integrations.find(
    (integration) => integration.name === "klaviyo" && integration.enabled
  );

  React.useEffect(() => {
    setShowKlaviyo(
      altSold == "yes"
        ? true
        : !selectedVariant?.availableForSale &&
            klaviyoIntegration?.enabled &&
            blockConfig.klaviyo?.enabled
    );
  }, [
    selectedVariant,
    klaviyoIntegration?.enabled,
    blockConfig.klaviyo?.enabled,
    altSold,
  ]);

  const formattedPrice = getPrice(selectedVariant);
  const sellingPlanId =
    searchParams.get("sellingPlanId") || pageState.searchParams.sellingPlanId;

  if (sellingPlanId) {
    const sellingPlans =
      product?.sellingPlanGroups?.edges[0]?.node?.sellingPlans?.edges || [];
    const selectedSellingPlan = sellingPlans.find(
      (sellingPlan) => sellingPlan.node.id === sellingPlanId
    );
    const adjustmentPercentage =
      selectedSellingPlan?.node?.priceAdjustments[0]?.adjustmentValue
        ?.adjustmentPercentage;

    formattedPrice.price =
      formattedPrice.price * (1 - adjustmentPercentage / 100);
  }
  // #endregion =-=-=-= END INITIALIZE PRODUCT DATA =-=-=-=

  const handleAddToCart = React.useCallback(() => {
    try {
      Tapcart.action("trigger/haptic");

      if (blockConfig?.animated) {
        animatedRef.current.classList.add("send-to-cart");
        setTimeout(() => {
          animatedRef.current.classList.remove("send-to-cart");
          setShowSuccess(true);
          Tapcart.action("trigger/haptic");

          setTimeout(() => {
            setShowSuccess(false);
          }, 3000);
        }, 1000);
      }

      // Build line items array
      const lineItems = [
        {
          variantId: altId ? altId : getIdFromGid(selectedVariant.id),
          quantity: 1,
          ...(sellingPlanId
            ? { sellingPlanId: getIdFromGid(sellingPlanId) }
            : {}),
        },
      ];

      // Add bra cup addon if checked and available
      if (isAddonChecked && addonVariantId) {
        lineItems.push({
          variantId: addonVariantId,
          quantity: 1,
        });
      }

      Tapcart.actions?.addToCart({
        cartAttributes: [],
        lineItems: lineItems,
      });
    } catch (error) {
      console.error(error.message);
      throw error;
    }
  }, [selectedVariant, sellingPlanId, altId, isAddonChecked, addonVariantId]);

  // Expose handleAddToCart to window so that Brauz Find In-Store component can re-use this function
  React.useEffect(
    () => {
      window.LSKDHelper_handleAddToCart = () => {
        handleAddToCart();
      }
    },
    [handleAddToCart]
  )

  const handleNotification = () => {
    Tapcart.actions?.getCustomerIdentity(null, {
      onSuccess: (user) => {
        if (!!user?.email) {
          const key = klaviyoIntegration.key;
          const options = {
            method: "POST",
            headers: {
              accept: "application/json",
              revision: "2025-01-15",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              data: {
                type: "back-in-stock-subscription",
                attributes: {
                  channels: ["PUSH"],
                  profile: {
                    data: {
                      type: "profile",
                      attributes: {
                        email: user.email,
                      },
                    },
                  },
                },
                relationships: {
                  variant: {
                    data: {
                      type: "catalog-variant",
                      id: `$shopify:::$default:::${getIdFromGid(
                        selectedVariant.id
                      )}`,
                    },
                  },
                },
              },
            }),
          };

          fetch(
            `https://a.klaviyo.com/client/back-in-stock-subscriptions/?company_id=${key}`,
            options
          ).then((res) => {
            if (res.ok) {
              Tapcart.action?.("app/toast", {
                hapticFeedback: true,
                message: "You've been added to the list!",
                type: "success",
              });
            } else {
              Tapcart.action?.("app/toast", {
                hapticFeedback: true,
                message: "Oops, something went wrong. Please try again.",
                type: "error",
              });
            }
          });
        } else {
          Tapcart.actions?.openAuthentication();
        }
      },
      onError: () => {
        Tapcart.actions?.openAuthentication();
      },
    });
  };

  // #region =-=-=-= INITIALIZE STYLES FROM BLOCK CONFIG =-=-=-=
  const containerStyle = React.useMemo(() => {
    return {
      ...(blockConfig.backgroundAndPadding.enabled &&
        getBackgroundAndPaddingStyle(blockConfig.backgroundAndPadding)),
      ...(blockConfig.sticky &&
        !__tapcartDashboard && {
          position: "fixed",
          bottom: 0,
          width: "100%",
          boxShadow: "0 0 10px #0000002b",
          zIndex: 9999,
        }),
    };
  }, [blockConfig.backgroundAndPadding]);

  const checkoutButtonStyle = React.useMemo(() => {
    const baseStyles = {
      ...(blockConfig.checkoutButton?.backgroundAndPadding?.enabled &&
        getBackgroundAndPaddingStyle(
          blockConfig.checkoutButton?.backgroundAndPadding
        )),
      ...(blockConfig.favorites?.enabled && {
        borderTopLeftRadius: "0",
        borderBottomLeftRadius: "0",
      }),
    };
    if (!selectedVariant || !selectedVariant.availableForSale) {
      return {
        ...baseStyles,
        backgroundColor: "var(--stateColors-disabled)",
      };
    }

    return baseStyles;
  }, [blockConfig.checkoutButton?.backgroundAndPadding, selectedVariant]);


  const klaviyoButtonStyle = React.useMemo(() => {
    const baseStyles = {
      ...(blockConfig.klaviyo?.backgroundAndPadding?.enabled &&
        getBackgroundAndPaddingStyle(
          blockConfig.klaviyo?.backgroundAndPadding
        )),
    };

    return baseStyles;
  }, [blockConfig.klaviyo?.backgroundAndPadding]);
  // #endregion =-=-=-= END STYLES FROM BLOCK CONFIG =-=-=-=

  const productIsReady = product && selectedVariant;
  //   const comingSoonTextStyle = React.useMemo(() => {
  //         return getTextStyle({
  //             ...blockConfig.checkoutButton,
  //         })
  //     }, [blockConfig.checkoutButton])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', column: '8px', padding: '4px 16px' }}>
      <TagContent product={product} country={country} section="pdp_above_atc" />
      {
        timeDifference > 0 ? (
          <Container
            className={cn("flex flex-row relative ", {
              "space-x-2": !withFavoriteButton,
              safeAreaBottom: blockConfig?.sticky,
            })}
            style={{
              ...(false
                ? containerStyle
                : { paddingLeft: "0px", paddingRight: "0px" }),
            }}
          >
            {blockConfig.checkoutButton.enabled && (
              <div className="flex flex-row w-full items-center gap-2 relative">
                <Button
                  disabled={true}
                  style={{
                    width: "100%",
                  }}
                >
                  <div
                    className={cn(
                      "w-full flex flex-row items-center justify-center animate-fadeIn"
                    )}
                  >
                    <ComingSoonCountdownTimer
                      metaDateTimeValue={metaDateTimeValue}
                    />
                  </div>
                </Button>
              </div>
            )}
          </Container>
        ) : 
        showKlaviyo ? (
          <Container
            className="flex flex-row"
            style={{
              ...(containerStyle
                ? containerStyle
                : { paddingLeft: "0px", paddingRight: "0px" }),
              paddingLeft: containerStyle ? containerStyle.paddingLeft : "0px",
              ...(__tapcartDashboard && { paddingTop: 0 }),
            }}
          >
            <Button
              className="p-0 rounded-none"
              onClick={handleNotification}
              style={klaviyoButtonStyle}
            >
              <div
                className={cn("w-full flex flex-row items-center gap-2", {
                  "justify-start": blockConfig.checkoutButton?.alignment === "left",
                  "justify-end": blockConfig.checkoutButton?.alignment === "right",
                  "justify-center":
                    blockConfig.checkoutButton?.alignment === "middle" ||
                    blockConfig.checkoutButton?.alignment === "center",
                })}
              >
                <Icon
                  url={blockConfig.klaviyo?.icon?.icon?.url}
                  size="sm"
                  style={{ color: getColor(blockConfig.klaviyo?.icon?.color) }}
                />
                <Text
                  className="animate-fadeIn"
                  type="body-primary"
                  style={getTextStyle(blockConfig.klaviyo)}
                >
                  {blockConfig.klaviyo?.text}
                </Text>
              </div>
            </Button>
          </Container>
        ) : (
          <>
            <style>
            {`
              .send-to-cart.cart-item {
                display: block;
                animation: curveMove 1s  cubic-bezier(0.65, 0, 0.35, 1) forwards;
                
              }

              @keyframes curveMove {
                0% {
                  transform: translate(0, 0) scale(0.8);
                  opacity: 0;
                }
                10% {
                  transform: translate(0, 0) scale(1.2);
                  opacity: 1;
                }
                50% {
                  transform: translate(0, -75px) scale(1.4);
                  opacity: 1;
                }
                100% {
                  transform: translate(0,0) scale(0.7);
                  opacity: 0;
                }
              }
              .safeAreaBottom {
                padding-bottom: max(env(safe-area-inset-bottom), 8px) !important;
              }
          `}
            </style>
          
            {/* Bra Cup Addon Checkbox - Only show for products with removable bra padding tag */}
            {showBraAddon &&
              !addonLoading &&
              addonIsAvailable &&
              addonVariantId &&
              addonVariantIsAvailable && (
                <Container
                  style={{
                    ...(containerStyle
                      ? containerStyle
                      : { paddingLeft: "0px", paddingRight: "0px" }),
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "1rem",
                      gap: "0.75rem",
                      width: "100%",
                    }}
                  >
                    {/* Image Container */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        flexShrink: 0,
                      }}
                    >
                      <img
                        src="https://cdn.shopify.com/s/files/1/0993/2004/files/Bra-Cup-Inserts.png?v=1708037116"
                        alt="Bra Cup Inserts"
                        style={{
                          height: "3rem",
                          width: "auto",
                        }}
                      />
                    </div>

                    {/* Label */}
                    <div
                      style={{
                        flex: 1,
                        padding: "0.3rem",
                      }}
                    >
                      <Text
                        type="body-secondary"
                        style={{
                          fontSize: "0.7rem",
                          lineHeight: "1.2",
                          color: "var(--textColors-primaryColor)",
                        }}
                      >
                        <span>ADD COMPLIMENTARY </span>
                        <strong>PUSH-UP</strong>
                        <span> CUPS TO ORDER?</span>
                      </Text>
                      <Text
                        type="body-secondary"
                        style={{
                          fontSize: "0.6rem",
                          marginTop: "0.25rem",
                          opacity: 0.8,
                          color: "var(--textColors-primaryColor)",
                        }}
                      >
                        (all bras come with regular padding by default)
                      </Text>
                    </div>

                    {/* Checkbox Container */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        padding: "1rem",
                        flexShrink: 0,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isAddonChecked}
                        onChange={(e) => setIsAddonChecked(e.target.checked)}
                        style={{
                          width: "1.25rem",
                          height: "1.25rem",
                          cursor: "pointer",
                          accentColor: "#000000",
                          appearance: "auto",
                          WebkitAppearance: "checkbox",
                          MozAppearance: "checkbox",
                          border: "2px solid #000000",
                          borderRadius: "3px",
                        }}
                      />
                    </div>
                  </div>
                </Container>
              )}

            <Container
              className={cn("flex flex-row relative ", {
                "space-x-2": !withFavoriteButton,
                safeAreaBottom: blockConfig?.sticky,
              })}
              style={{
                ...(containerStyle
                  ? containerStyle
                  : { paddingLeft: "0px", paddingRight: "0px" }),
                paddingLeft: withFavoriteButton
                  ? "65px"
                  : containerStyle
                  ? containerStyle.paddingLeft
                  : "0px",
              }}
            >
              {blockConfig.checkoutButton.enabled && (
                <div className="flex flex-row w-full items-center gap-2 relative">
                  <Button
                    onClick={() => {
                      if (altSold != "yes") {
                        handleAddToCart();
                      }
                    }}
                    disabled={
                      !productIsReady ||
                      !selectedVariant.availableForSale ||
                      !variantId ||
                      altSold == "yes"
                    }
                    style={{
                      ...checkoutButtonStyle,
                      width: "100%",
                    }}
                  >
                    <div
                      className={cn(
                        "w-full flex flex-row items-center gap-2 animate-fadeIn",
                        {
                          "justify-between":
                            blockConfig.checkoutButton?.relation === "spacedApart",
                          "justify-start":
                            blockConfig.checkoutButton?.alignment === "left" &&
                            blockConfig.checkoutButton?.relation === "sideBySide",
                          "justify-end":
                            blockConfig.checkoutButton?.alignment === "right" &&
                            blockConfig.checkoutButton?.relation === "sideBySide",
                          "justify-center":
                            (blockConfig.checkoutButton?.alignment === "middle" ||
                              blockConfig.checkoutButton?.alignment === "center") &&
                            blockConfig.checkoutButton?.relation === "sideBySide",
                        }
                      )}
                    >
                      {showSuccess ? (
                        <ButtonSuccessText blockConfig={blockConfig} />
                      ) : (
                        <ButtonText
                            blockConfig={blockConfig}
                            tapcartData={tapcartData}
                            price={formattedPrice}
                            selectedVariant={selectedVariant}
                            altAvail={altAvail}
                            altSold={altSold}
                          />
                      )}
                    </div>
                  </Button>
                </div>
              )}

              {product?.images?.[0] && blockConfig?.animated && (
                <div
                  ref={animatedRef}
                  className="cart-item"
                  style={{
                    width: "40px",
                    height: "40px",
                    opacity: 0,
                    borderRadius: "5px",
                    overflow: "hidden",
                    position: "absolute",
                    left: "calc(50% - 20px)",
                    transform: "scale(1)",
                    zIndex: 999,
                    pointerEvents: "none",
                    boxShadow: "0 2px 8px #0000004d",
                  }}
                >
                  {altId && altImage ? (
                    <img src={altImage} alt={product?.title} />
                  ) : (
                    <Image
                      alt={product?.title}
                      data={product?.images?.[0]}
                      sizes="40px"
                    />
                  )}
                </div>
              )}
            </Container>
          </>
        )
      }
      <TagContent product={product} country={country} section="pdp_below_atc" />
    </div>
  )
}