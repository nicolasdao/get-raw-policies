# get-raw-policies

> This utility is used to periodically maintain this list: https://raw.githubusercontent.com/nicolasdao/get-raw-policies/master/managed-policies.json.
> It is __NOT RECOMMENDED__ to use this utility to search AWS managed policies. To search AWS managed policies, use __`npx get-policies`__ instead.

```
npx https://github.com/nicolasdao/get-raw-policies --save ./managed-policies.json
```

List all the AWS managed policies. Requires that the AWS CLI is installed and that the current default profile is logged in. Behind this scene, the package executes the following commands:

List all the AWS managed policies:
```
aws iam list-policies --scope AWS
```

Gets a policy's document's details (i.e., Action, Effect, Resource):
```
aws iam get-policy-version --policy-arn ${arn} --version-id ${versionId}
```

To speed up this command completion, the number of concurrent requests to AWS can be increased as follow:

```
npx https://github.com/nicolasdao/get-raw-policies --save ./managed-policies.json --concurrency 50
```

> Default concurrency is 10.