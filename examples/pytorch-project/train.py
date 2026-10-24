"""Small deterministic CPU experiment. No downloads or third-party datasets."""
import argparse
import json
import os
import time
from pathlib import Path

import torch

parser = argparse.ArgumentParser()
parser.add_argument('--lr', type=float, default=0.01)
parser.add_argument('--epochs', type=int, default=12)
parser.add_argument('--seed', type=int, default=7)
parser.add_argument('--sleep', type=float, default=0.0)
args = parser.parse_args()
torch.set_num_threads(1)
torch.manual_seed(args.seed)
generator = torch.Generator().manual_seed(42)
x = torch.randn(320, 4, generator=generator)
y = (x[:, 0] + 0.6 * x[:, 1] - 0.3 * x[:, 2] > 0).long()
train_x, val_x = x[:256], x[256:]
train_y, val_y = y[:256], y[256:]
model = torch.nn.Sequential(torch.nn.Linear(4, 12), torch.nn.Tanh(), torch.nn.Linear(12, 2))
optimizer = torch.optim.SGD(model.parameters(), lr=args.lr)
loss_fn = torch.nn.CrossEntropyLoss()
points = []
for epoch in range(args.epochs):
    model.train()
    optimizer.zero_grad()
    loss = loss_fn(model(train_x), train_y)
    loss.backward()
    optimizer.step()
    model.eval()
    with torch.no_grad():
        accuracy = (model(val_x).argmax(1) == val_y).float().mean().item()
    points.extend([{'name': 'train_loss', 'value': loss.item(), 'step': epoch},
                   {'name': 'val_accuracy', 'value': accuracy, 'step': epoch}])
    print(f'epoch={epoch} loss={loss.item():.6f} val_accuracy={accuracy:.4f}', flush=True)
    if args.sleep:
        time.sleep(args.sleep)
output = Path(os.environ.get('MLSTACK_METRICS_PATH', 'results/metrics.json'))
output.parent.mkdir(parents=True, exist_ok=True)
temporary = output.with_suffix('.tmp')
temporary.write_text(json.dumps({'schema_version': 1, 'metrics': points}, allow_nan=False))
temporary.replace(output)
print(f'Metrics saved to {output}', flush=True)
