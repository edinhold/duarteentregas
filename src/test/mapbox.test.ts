import { describe, it, expect } from "vitest";
import {
  parseMapboxFeature,
  validatePrimaveraResult,
  MapboxError,
  PRIMAVERA_DO_LESTE_CENTER,
} from "../config/mapbox";

describe("Mapbox Config & Utilities", () => {
  it("should correctly parse valid Mapbox v6 feature", () => {
    const feature = {
      id: "feature-123",
      geometry: {
        type: "Point",
        coordinates: [-54.3079, -15.5595],
      },
      properties: {
        mapbox_id: "mb-123",
        full_address: "Rua Curitiba, 100, Centro, Primavera do Leste, MT, Brasil",
        name: "Rua Curitiba",
        context: {
          street: { name: "Rua Curitiba" },
          address: { address_number: "100" },
          neighborhood: { name: "Centro" },
          place: { name: "Primavera do Leste" },
          region: { region_code: "MT" },
          country: { name: "Brasil" },
        },
      },
    };

    const parsed = parseMapboxFeature(feature);
    expect(parsed).not.toBeNull();
    expect(parsed?.street).toBe("Rua Curitiba");
    expect(parsed?.number).toBe("100");
    expect(parsed?.neighborhood).toBe("Centro");
    expect(parsed?.city).toBe("Primavera do Leste");
    expect(parsed?.state).toBe("MT");
    expect(parsed?.longitude).toBe(-54.3079);
    expect(parsed?.latitude).toBe(-15.5595);
  });

  it("should validate address within Primavera do Leste bounding box", () => {
    const validResult = {
      street: "Rua Curitiba",
      number: "100",
      neighborhood: "Centro",
      city: "Primavera do Leste",
      state: "MT",
      postcode: "78850-000",
      country: "Brasil",
      longitude: PRIMAVERA_DO_LESTE_CENTER.longitude,
      latitude: PRIMAVERA_DO_LESTE_CENTER.latitude,
      formattedAddress: "Rua Curitiba, 100, Primavera do Leste, MT",
      mapboxId: "mb-123",
      matchMetadata: { confidence: "high" },
    };

    expect(() => validatePrimaveraResult(validResult)).not.toThrow();
  });

  it("should reject address outside Primavera do Leste", () => {
    const invalidResult = {
      street: "Avenida Paulista",
      number: "1000",
      neighborhood: "Bela Vista",
      city: "São Paulo",
      state: "SP",
      postcode: "01310-100",
      country: "Brasil",
      longitude: -46.6544,
      latitude: -23.5614,
      formattedAddress: "Avenida Paulista, São Paulo, SP",
      mapboxId: "mb-999",
      matchMetadata: { confidence: "high" },
    };

    expect(() => validatePrimaveraResult(invalidResult)).toThrowError(MapboxError);
  });
});
