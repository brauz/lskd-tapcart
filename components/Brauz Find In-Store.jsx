import * as React from "react";

import {
  // components
  Drawer,
  DrawerContentBase,
  // utilities
  productGidFromId,
  variantGidFromId,
  cn,
} from "@tapcart/mobile-components";

// LSKD config
const REGION = "AU"; //AU OR US

const STORE_NAME = {
  AU: "loosekid",
  US: "loosekid-us",
};

const TOKEN = {
  AU: "adf030af27addd2acf6906f4b810d150",
  US: "2d6c85b567bb77eb954d948efe18c605",
};

const API_VERSION = "2026-01";

// Brauz config
const SERVICE_NAME = "Find In-Store";
const SERVICE_NAME_CODE = SERVICE_NAME.toLowerCase()
  .trim()
  .replace(/ /g, "_")
  .replace(/&/g, "and");

const MESSAGE_REQUEST_IFRAME_DATA = "MESSAGE_REQUEST_IFRAME_DATA";
const MESSAGE_GET_IFRAME_DATA = "MESSAGE_GET_IFRAME_DATA";
const MESSAGE_OPEN_DRAWER = "MESSAGE_OPEN_DRAWER";
const MESSAGE_CLOSE_DRAWER = "MESSAGE_CLOSE_DRAWER";
const MESSAGE_ADJUST_WIDGET_HEIGHT = "MESSAGE_ADJUST_WIDGET_HEIGHT";
const MESSAGE_UPDATE_LOCATION_DATA = "MESSAGE_UPDATE_LOCATION_DATA";
const MESSAGE_UPDATE_SELECTED_STORE_ID = "MESSAGE_UPDATE_SELECTED_STORE_ID";
const MESSAGE_SELECT_VARIANT = "MESSAGE_SELECT_VARIANT";
const MESSAGE_TRIGGER_ADD_TO_CART_BUTTON = "MESSAGE_TRIGGER_ADD_TO_CART_BUTTON";

const ROOT_IFRAME_URL = "https://brauz-lskd-fis-fe.netlify.app";

const WIDGETS = {
  FIND_IN_STORE_ON_PRODUCT_PAGE: {
    id: "brauz-find-in-store-product-page",
    pathname: "find-in-store",
  },
  FIND_IN_STORE_DRAWER: {
    id: "brauz-find-in-store-drawer-widget-iframe",
    pathname: "find-in-store-drawer",
  },
};

const LOCAL_STORAGE = {
  SELECTED_STORE_ID: `Brauz_${SERVICE_NAME_CODE}_selected_store_id`,
  LOCATION: `Brauz_${SERVICE_NAME_CODE}_location`,
};

const GROUP_NUMBER = "LSKD";
const DOMAIN = "loosekid.myshopify.com";
const ORIGIN = window.location.origin;

export default function BrauzFindInStoreWidget({ pageState, useSearchParams }) {
  // hooks
  const search_params = useSearchParams();

  // gid://shopify/Product/1234567890
  const product_gid = productGidFromId(
    search_params.get("productId") || pageState.searchParams.productId,
  );

  // gid://shopify/ProductVariant/1234567890
  const variant_gid = variantGidFromId(
    search_params.get("variantId") || pageState.searchParams.variantId,
  );

  // Extract numeric ID from GID, if GID is not valid, return empty string
  const variant_id = String(getIdFromGid(variant_gid || "") || "");

  // shared data
  const [widget_height_data, setWidgetHeightData] = React.useState({});
  const [iframe_data, setIframeData, iframe_data_ref] = useStateRef({});

  // state
  const [is_show_find_in_store_drawer, setIsShowFindInStoreDrawer] =
    React.useState(false);

  // hooks
  const sendIframeDataToAllIframes = React.useCallback(() => {
    postMessageToIframe({
      message: {
        code: MESSAGE_GET_IFRAME_DATA,
        iframe_data: {
          location_data: {},
          ...iframe_data_ref.current,
        },
      },
      origin: ROOT_IFRAME_URL,
    });
  }, [iframe_data_ref]);

  const receiveMessage = React.useCallback(
    (event) => {
      if ([ROOT_IFRAME_URL].includes(event.origin)) {
        const { data = {} } = event;
        const { code = "" } = data;

        if (code === MESSAGE_REQUEST_IFRAME_DATA) {
          sendIframeDataToAllIframes();
        }

        if (code === MESSAGE_ADJUST_WIDGET_HEIGHT) {
          const { iframe_id, height = 0 } = data;

          setWidgetHeightData((prev) => ({
            ...prev,
            [iframe_id]: height,
          }));
        }

        if (code === MESSAGE_OPEN_DRAWER) {
          setIsShowFindInStoreDrawer(true);

          // reset drawer iframe height to 0 so that it can show loader while the iframe content is loading
          setWidgetHeightData((prev) => ({
            ...prev,
            [WIDGETS.FIND_IN_STORE_DRAWER.id]: 0,
          }));
        }

        if (code === MESSAGE_CLOSE_DRAWER) {
          setIsShowFindInStoreDrawer(false);
        }

        if (code === MESSAGE_UPDATE_LOCATION_DATA) {
          const location_data = data.location_data || {};

          updateDataLocalStorage(LOCAL_STORAGE.LOCATION, location_data);

          setIframeData((prev) => ({
            ...prev,
            location_data,
          }));
        }

        if (code === MESSAGE_UPDATE_SELECTED_STORE_ID) {
          const selected_store_id = data.selected_store_id || "";

          if (selected_store_id) {
            updateDataLocalStorage(LOCAL_STORAGE.SELECTED_STORE_ID, {
              selected_store_id,
            });

            setIframeData((prev) => ({
              ...prev,
              selected_store_id,
            }));
          }
        }

        if (code === MESSAGE_SELECT_VARIANT) {
          const { variant = {} } = data;

          if (variant.optiona_name && variant.optiona_value) {
            window.LSKDHelper_handleSelect?.(
              variant.optiona_name,
              variant.optiona_value,
            );
          }
        }

        if (code === MESSAGE_TRIGGER_ADD_TO_CART_BUTTON) {
          window.LSKDHelper_handleAddToCart?.();
        }
      }
    },
    [
      sendIframeDataToAllIframes,
      setWidgetHeightData,
      setIsShowFindInStoreDrawer,
      setIframeData,
    ],
  );

  React.useEffect(() => {
    // on initial load, get necessary data from local storage and send to iframe
    (async function () {
      // 1. selected store data
      const store_data = retrieveDataLocalStorage(
        LOCAL_STORAGE.SELECTED_STORE_ID,
      );

      // 2. location data
      const location_data = retrieveDataLocalStorage(LOCAL_STORAGE.LOCATION);

      setIframeData((prev) => ({
        ...prev,
        location_data,
        selected_store_id: store_data?.selected_store_id || "",
      }));
    })();

    // Listen for messages from the iframe
    window.addEventListener("message", receiveMessage, false);

    return () => {
      window.removeEventListener("message", receiveMessage);
    };
  }, [receiveMessage]);

  React.useEffect(() => {
    (async function () {
      const product = await fetchProduct(product_gid);

      setIframeData((prev) => ({
        ...prev,
        product,
      }));
    })();
  }, [product_gid]);

  React.useEffect(() => {
    setIframeData((prev) => ({
      ...prev,
      variant_id,
    }));
  }, [variant_id]);

  React.useEffect(() => {
    sendIframeDataToAllIframes();
  }, [iframe_data, sendIframeDataToAllIframes]);

  function postMessageToIframe({ message, origin }) {
    try {
      Object.values(WIDGETS).forEach((widget) => {
        const id = widget.id;
        const iframe = document.getElementById(id);

        if (iframe && iframe.contentWindow) {
          iframe.contentWindow.postMessage(message, origin);
        }
      });
    } catch (e) {
      console.log("Error posting message to iframe:", e);
    }
  }

  return (
    <div>
      {/* You can remove this. However, after removing it, the block height in Tapcart is almost zero in the preview mode. */}
      {Object.keys(widget_height_data).length === 0 && (
        <div className="p-4">Loading...</div>
      )}

      <div
        className="container flex flex-row relative empty:hidden"
        style={{ padding: 0 }}
      >
        <Widget
          iframe_id={WIDGETS.FIND_IN_STORE_ON_PRODUCT_PAGE.id}
          pathname={WIDGETS.FIND_IN_STORE_ON_PRODUCT_PAGE.pathname}
          widget_height_data={widget_height_data}
        />
      </div>

      <Drawer
        open={is_show_find_in_store_drawer}
        onOpenChange={() => {
          setIsShowFindInStoreDrawer((prev) => !prev);
        }}
      >
        <DrawerContentBase>
          <div className="no-scrollbar overflow-y-auto">
            <Widget
              style={{
                marginTop: "-24px",
              }}
              iframe_id={WIDGETS.FIND_IN_STORE_DRAWER.id}
              pathname={WIDGETS.FIND_IN_STORE_DRAWER.pathname}
              widget_height_data={widget_height_data}
              renderLoader={() => <div className="p-4 h-20">Loading...</div>}
            />
          </div>
        </DrawerContentBase>
      </Drawer>
    </div>
  );
}

function Widget(props) {
  const {
    className,
    style,
    iframe_id,
    pathname,
    widget_height_data,
    renderLoader,
  } = props;

  const encoded_iframe_config = btoa(
    JSON.stringify({
      group_number: GROUP_NUMBER,
      origin: ORIGIN,
      domain: DOMAIN,
      iframe_id,
      // MUST include this to identify that the iframe is rendered in Tapcart
      is_tapcart: true,
    }),
  );

  const iframe_height = widget_height_data?.[iframe_id] || 0;

  const complete_iframe_url = `${ROOT_IFRAME_URL}/${pathname}/?iframe_config=${encoded_iframe_config}`;

  return (
    <React.Fragment>
      {renderLoader &&
        typeof renderLoader === "function" &&
        iframe_height === 0 &&
        renderLoader?.()}

      <iframe
        title={SERVICE_NAME}
        id={iframe_id}
        src={complete_iframe_url}
        allow={`geolocation ${ROOT_IFRAME_URL};`}
        className={cn("w-full border-none", className)}
        style={{
          ...(style || {}),
          width: "100%",
          border: "none",
          height: `${iframe_height}px`,
        }}
      />
    </React.Fragment>
  );
}

const STOREFRONT_API = (query) => {
  return async function (variables = {}) {
    const url = `https://${STORE_NAME[REGION]}.myshopify.com/api/${API_VERSION}/graphql.json`;

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
};

const fetchProduct = async (product_gid) => {
  try {
    const query = STOREFRONT_API(`#graphql
        {
        product(id: "${product_gid}") {
          id
          title
          vendor
          productType
          handle
          tags
          variants(first: 100) {
            edges {
              node {
                id
                title
                price {
                  amount
                }
                sku
                selectedOptions {
                  name
                  value
                }
                barcode
              }
            }
          }
        }
      }
    `);

    const { data } = await query();
    const product = data?.product || {};

    // Transform the GraphQL response to match your desired format
    const formatted_product = {
      id: parseInt(product.id.split("/").pop()), // Extract numeric ID from GID
      title: product.title,
      vendor: product.vendor,
      product_type: product.productType,
      handle: product.handle,
      tags: product.tags.join(", "), // Convert array to comma-separated string
      variants: product.variants.edges.map((edge) => {
        const variant = edge.node;

        // Extract option values (option1, option2, option3)
        const options = variant.selectedOptions.reduce((acc, option, index) => {
          acc[`option${index + 1}`] = option.value;
          return acc;
        }, {});

        // Ensure we always have option1, option2, option3 (even if null)
        const option1 = options.option1 || null;
        const option2 = options.option2 || null;
        const option3 = options.option3 || null;

        return {
          id: parseInt(variant.id.split("/").pop()),
          product_id: parseInt(product.id.split("/").pop()),
          title: variant.title,
          price: parseFloat(variant.price.amount).toFixed(2),
          sku: variant.sku || "",
          option1: option1,
          option2: option2,
          option3: option3,
          barcode: variant.barcode || "",
        };
      }),
    };

    return formatted_product;
  } catch (e) {
    console.error("Error fetching product:", e);
    return {};
  }
};

function useStateRef(initialValue) {
  const [state, setState] = React.useState(initialValue);
  const ref = React.useRef(initialValue);

  const setStateRef = React.useCallback((value) => {
    // Handle functional updates
    const newValue = typeof value === "function" ? value(ref.current) : value;

    ref.current = newValue;
    setState(newValue);
  }, []);

  return [state, setStateRef, ref];
}

function getIdFromGid(gid) {
  return parseInt(gid?.split("/").pop(), 10) || null;
}

function updateDataLocalStorage(local_storage_name, data) {
  if (!local_storage_name) {
    return {};
  }

  const json_data = retrieveDataLocalStorage(local_storage_name);

  const updated_data = {
    ...json_data,
    ...data,
  };

  localStorage.setItem(local_storage_name, JSON.stringify(updated_data));
}

function retrieveDataLocalStorage(local_storage_name) {
  if (!local_storage_name) {
    return {};
  }

  const local_storage_data = localStorage.getItem(local_storage_name);

  if (local_storage_data) {
    const json_data = JSON.parse(local_storage_data);
    return json_data;
  } else {
    return {};
  }
}
