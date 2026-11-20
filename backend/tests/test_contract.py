from pathlib import Path
import yaml
from jsonschema import Draft202012Validator, FormatChecker
from test_chores import template, task
from test_payments import wage

BASE = yaml.safe_load(
    (Path(__file__).parents[2] / "docs/backend/openapi.yaml").read_text()
)


def resolve(doc, s):
    if "$ref" in s:
        return resolve(doc, doc["components"]["schemas"][s["$ref"].split("/")[-1]])
    if "allOf" in s:
        result = {"properties": {}, "required": []}
        for part in s["allOf"]:
            sub = resolve(doc, part)
            result["properties"].update(sub.get("properties", {}))
            result["required"].extend(sub.get("required", []))
        return result
    return s


def shape(doc, s):
    s = resolve(doc, s)
    if "const" in s:
        s = {**s, "enum": [s["const"]]}
    if "anyOf" in s:
        return shape(doc, next(x for x in s["anyOf"] if x.get("type") != "null"))
    if "properties" in s:
        return {
            "required": sorted(s.get("required", [])),
            "properties": {k: shape(doc, v) for k, v in s["properties"].items()},
        }
    if s.get("type") == "array":
        return {"type": "array", "items": shape(doc, s["items"])}
    return {
        k: s[k]
        for k in (
            "type",
            "format",
            "enum",
            "minLength",
            "maxLength",
            "minimum",
            "maximum",
            "pattern",
            "minItems",
        )
        if k in s
    }


def test_native_openapi_paths_fields_statuses_and_security(client):
    actual = client.get("/api/v1/openapi.json").json()
    paths = {p.removeprefix("/api/v1"): v for p, v in actual["paths"].items()}
    assert set(paths) == set(BASE["paths"])
    for path, methods in BASE["paths"].items():
        for method, expected in methods.items():
            live = paths[path][method]
            assert live["operationId"] == expected["operationId"]
            assert set(expected["responses"]) <= set(live["responses"]), (
                path,
                method,
                "statuses",
            )
            if expected.get("security", BASE["security"]):
                assert live.get("security"), (path, "bearer security missing")
            for param in expected.get("parameters", []):
                if "$ref" in param:
                    param = BASE["components"]["parameters"][
                        param["$ref"].split("/")[-1]
                    ]
                liveparam = next(
                    x
                    for x in live.get("parameters", [])
                    if x["name"].lower() == param["name"].lower()
                )
                assert liveparam.get("required", False) == param.get(
                    "required", False
                ), (path, param["name"], "required")
                assert shape(actual, liveparam["schema"]) == shape(
                    BASE, param["schema"]
                ), (path, param["name"], "schema")
            if "requestBody" in expected:
                assert shape(
                    BASE,
                    expected["requestBody"]["content"]["application/json"]["schema"],
                ) == shape(
                    actual, live["requestBody"]["content"]["application/json"]["schema"]
                ), (path, "request fields")
            for status, response in expected["responses"].items():
                if "$ref" in response:
                    response = BASE["components"]["responses"][
                        response["$ref"].split("/")[-1]
                    ]
                if "content" in response:
                    assert shape(
                        BASE, response["content"]["application/json"]["schema"]
                    ) == shape(
                        actual,
                        live["responses"][status]["content"]["application/json"][
                            "schema"
                        ],
                    ), (path, status, "response fields")


def jsonschema_model(doc, s):
    if "$ref" in s:
        return jsonschema_model(
            doc, doc["components"]["schemas"][s["$ref"].split("/")[-1]]
        )
    result = {k: v for k, v in s.items() if k != "nullable"}
    for key in ("properties",):
        if key in result:
            result[key] = {k: jsonschema_model(doc, v) for k, v in result[key].items()}
    if "items" in result:
        result["items"] = jsonschema_model(doc, result["items"])
    if "allOf" in result:
        result["allOf"] = [jsonschema_model(doc, v) for v in result["allOf"]]
    if s.get("nullable"):
        return {"anyOf": [result, {"type": "null"}]}
    return result


def validate(name, value):
    Draft202012Validator(
        jsonschema_model(BASE, BASE["components"]["schemas"][name]),
        format_checker=FormatChecker(),
    ).validate(value)


def test_real_responses_match_baseline_schema(pair):
    a, b, root = pair
    validate("AuthTokenResponse", a.data)
    validate("MeResponse", a.get("/me").json())
    validate("HouseholdDetail", a.get(root).json())
    t = template(a, root, 999)
    validate("ChoreType", t)
    p = task(a, root, t["id"])
    validate("TaskDetail", a.get(p).json())
    w = wage(a, b, root, t["id"])
    validate("Wage", w)
    r = b.post(root + "/payments/preview", {"wage_ids": [w["id"]]}, idem=False)
    validate("PaymentPreview", r.json())
    pay = b.post(root + "/payments", {"wage_ids": [w["id"]]}).json()
    validate("PaymentDetail", pay)
    validate("LedgerSummary", a.get(root + "/ledger/summary").json())
    validate("WageListResponse", a.get(root + "/wages").json())
    validate("TaskListResponse", a.get(root + "/tasks").json())
    validate("PaymentListResponse", a.get(root + "/payments").json())
